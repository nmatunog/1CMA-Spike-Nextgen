import { randomUUID } from 'node:crypto';
import {
  identityIsSuppressed,
  isStopped,
} from './suppression';
import {
  isAllowedRef,
  isAllowedSource,
  isCodeStatus,
  isValidEmail,
  isValidPhone,
  normalizeEmail,
  normalizePhone,
} from './contacts';
import { parseCsv, rowObject } from './csv';
import { EVENT_KINDS } from './stages';
import type { Sql, SqlTx } from './store';
import type { ImportLine, ImportReport, StaffActor } from './types';

function jsonParam(t: SqlTx, value: unknown) {
  return t.json ? t.json(value) : JSON.stringify(value);
}

async function audit(t: SqlTx, kind: string, actor: string, metadata: Record<string, unknown>) {
  await t`INSERT INTO command_audit_events(kind,actor,metadata) VALUES(${kind},${actor},${jsonParam(t, metadata)})`;
}

async function emit(t: SqlTx, candidateId: string, kind: string, actor: string, metadata: Record<string, unknown>) {
  await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES(${candidateId},${kind},${actor},${jsonParam(t, metadata)})`;
}

function orderedPair(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

export function parseProspectRow(raw: Record<string, string>, line: number): ImportLine {
  const name = (raw.name || '').trim().slice(0, 120);
  const email = normalizeEmail(raw.email);
  const phone = normalizePhone(raw.phone);
  const source = (raw.source || 'csv').trim().toLowerCase() || 'csv';
  const versaLeadRef = (raw.versa_lead_ref || '').trim();
  const spikeLearnerRef = (raw.spike_learner_ref || '').trim();
  const programInterest = (raw.program_interest || '').trim().slice(0, 80);
  const offering = (raw.offering || '').trim().slice(0, 20);
  const codeStatus = (raw.code_status || '').trim().toLowerCase();
  if (!name) return { line, status: 'rejected', reason: 'missing_name' };
  if (!email && !phone) return { line, status: 'rejected', reason: 'missing_contact' };
  if (email && !isValidEmail(email)) return { line, status: 'rejected', reason: 'invalid_email' };
  if (raw.phone && !phone) return { line, status: 'rejected', reason: 'invalid_phone' };
  if (phone && !isValidPhone(phone)) return { line, status: 'rejected', reason: 'invalid_phone' };
  if (!isAllowedSource(source)) return { line, status: 'rejected', reason: 'invalid_source' };
  if (versaLeadRef && !isAllowedRef(versaLeadRef)) return { line, status: 'rejected', reason: 'invalid_versa_lead_ref' };
  if (spikeLearnerRef && !isAllowedRef(spikeLearnerRef)) return { line, status: 'rejected', reason: 'invalid_spike_learner_ref' };
  if (codeStatus && !isCodeStatus(codeStatus)) return { line, status: 'rejected', reason: 'invalid_code_status' };
  if (codeStatus && !offering) return { line, status: 'rejected', reason: 'code_status_needs_offering' };
  return {
    line,
    status: 'pending',
    name,
    email,
    phone,
    source,
    versaLeadRef: versaLeadRef || '',
    spikeLearnerRef: spikeLearnerRef || '',
    programInterest,
    offering,
    codeStatus,
    consentClaimed: !!(raw.consent || raw.consent_status),
  };
}

async function findByVersa(t: SqlTx, ref: string) {
  if (!ref) return null;
  const [mapped] = await t`SELECT candidate_id FROM versa_lead_map WHERE versa_lead_ref=${ref}`;
  if (mapped) return String(mapped.candidate_id);
  const [identity] = await t`SELECT candidate_id FROM candidate_identities WHERE source='versa' AND external_id=${ref}`;
  return identity ? String(identity.candidate_id) : null;
}

async function findVerified(t: SqlTx, email: string, phone: string) {
  if (email) {
    const [row] = await t`SELECT id FROM candidates WHERE email_normalized=${email} AND email_verified LIMIT 1`;
    if (row) return String(row.id);
  }
  if (phone) {
    const [row] = await t`SELECT id FROM candidates WHERE phone_normalized=${phone} AND phone_verified LIMIT 1`;
    if (row) return String(row.id);
  }
  return null;
}

async function unverifiedMatches(t: SqlTx, email: string, phone: string, except?: string) {
  const ids: { id: string; matchOn: 'email' | 'phone' }[] = [];
  if (email) {
    const rows = await t`SELECT id FROM candidates WHERE email_normalized=${email} AND (${except || ''} = '' OR id::text <> ${except || ''})`;
    for (const row of rows) ids.push({ id: String(row.id), matchOn: 'email' });
  }
  if (phone) {
    const rows = await t`SELECT id FROM candidates WHERE phone_normalized=${phone} AND (${except || ''} = '' OR id::text <> ${except || ''})`;
    for (const row of rows) ids.push({ id: String(row.id), matchOn: 'phone' });
  }
  return ids;
}

async function flagDuplicate(t: SqlTx, left: string, right: string, matchOn: 'email' | 'phone') {
  const [a, b] = orderedPair(left, right);
  await t`INSERT INTO candidate_duplicate_flags(left_candidate_id,right_candidate_id,match_on)
    VALUES(${a},${b},${matchOn}) ON CONFLICT DO NOTHING`;
}

async function attachVersa(t: SqlTx, candidateId: string, versaLeadRef: string, spikeLearnerRef: string) {
  if (!versaLeadRef) return;
  const [mapped] = await t`SELECT candidate_id FROM versa_lead_map WHERE versa_lead_ref=${versaLeadRef}`;
  if (mapped && String(mapped.candidate_id) !== candidateId) throw new Error('versa_lead_ref_conflict');
  const [identity] = await t`SELECT candidate_id FROM candidate_identities WHERE source='versa' AND external_id=${versaLeadRef}`;
  if (identity && String(identity.candidate_id) !== candidateId) throw new Error('versa_lead_ref_conflict');
  await t`INSERT INTO versa_lead_map(versa_lead_ref,candidate_id,spike_learner_ref)
    VALUES(${versaLeadRef},${candidateId},${spikeLearnerRef || null})
    ON CONFLICT (versa_lead_ref) DO UPDATE SET spike_learner_ref = COALESCE(EXCLUDED.spike_learner_ref, versa_lead_map.spike_learner_ref)`;
  await t`INSERT INTO candidate_identities(source,external_id,candidate_id)
    VALUES('versa',${versaLeadRef},${candidateId}) ON CONFLICT DO NOTHING`;
  await t`UPDATE candidates SET versa_lead_ref=${versaLeadRef} WHERE id=${candidateId} AND (versa_lead_ref IS NULL OR versa_lead_ref='')`;
}

async function recordCodeStatus(
  t: SqlTx,
  candidateId: string,
  actor: string,
  row: ImportLine,
) {
  if (!row.codeStatus || !row.offering) return;
  await emit(t, candidateId, EVENT_KINDS.codeStatus, actor, {
    offering: row.offering,
    status: row.codeStatus,
    versaLeadRef: row.versaLeadRef || null,
  });
}

async function createCandidate(t: SqlTx, actor: string, batchId: string, row: ImportLine) {
  const id = randomUUID();
  await t`INSERT INTO candidates(id,name,email,phone,score,stage,email_normalized,phone_normalized,program_interest,versa_lead_ref)
    VALUES(${id},${row.name},${row.email || ''},${row.phone || ''},0,'new_lead',${row.email || null},${row.phone || null},${row.programInterest || null},${row.versaLeadRef || null})`;
  const externalId = row.versaLeadRef || randomUUID();
  const source = row.versaLeadRef ? 'versa' : row.source;
  await t`INSERT INTO candidate_identities(source,external_id,candidate_id) VALUES(${source},${externalId},${id}) ON CONFLICT DO NOTHING`;
  if (row.versaLeadRef) await attachVersa(t, id, row.versaLeadRef, row.spikeLearnerRef || '');
  await emit(t, id, EVENT_KINDS.created, actor, { batchId, line: row.line, source: row.source, via: 'csv' });
  await recordCodeStatus(t, id, actor, row);
  return id;
}

async function mergeCandidate(t: SqlTx, actor: string, batchId: string, candidateId: string, row: ImportLine) {
  const [c] = await t`SELECT stage FROM candidates WHERE id=${candidateId}`;
  if (isStopped(c)) throw new Error('suppressed');
  if (row.programInterest) {
    await t`UPDATE candidates SET program_interest=COALESCE(program_interest, ${row.programInterest}) WHERE id=${candidateId}`;
  }
  if (row.versaLeadRef) await attachVersa(t, candidateId, row.versaLeadRef, row.spikeLearnerRef || '');
  await emit(t, candidateId, EVENT_KINDS.importMerged, actor, { batchId, line: row.line, via: 'csv' });
  await recordCodeStatus(t, candidateId, actor, row);
}

export async function previewOrImportCsv(
  sql: Sql,
  actor: StaffActor,
  input: { csv: string; filename?: string; dryRun: boolean },
): Promise<ImportReport> {
  if (actor.role !== 'admin') throw new Error('forbidden');
  const filename = (input.filename || 'upload.csv').replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 80) || 'upload.csv';
  const parsed = parseCsv(input.csv);
  const prospects = parsed.rows.map((cells, i) => parseProspectRow(rowObject(parsed.headers, cells), i + 2));

  if (input.dryRun) {
    const report = await sql.begin(async (t: SqlTx) => simulate(t, prospects));
    return { ...report, batchId: 'dry-run', dryRun: true, filename, sha256: parsed.sha256, idempotent: false };
  }

  return sql.begin(async (t: SqlTx) => {
    const [existing] = await t`SELECT id, accepted, rejected, flagged, merged, report FROM import_batches WHERE file_sha256=${parsed.sha256}`;
    if (existing) {
      await audit(t, EVENT_KINDS.csvImported, actor.email, {
        batchId: existing.id,
        sha256: parsed.sha256,
        idempotent: true,
      });
      return {
        batchId: String(existing.id),
        dryRun: false,
        filename,
        sha256: parsed.sha256,
        idempotent: true,
        accepted: Number(existing.accepted),
        rejected: Number(existing.rejected),
        flagged: Number(existing.flagged),
        merged: Number(existing.merged),
        lines: Array.isArray(existing.report) ? existing.report as ImportLine[] : JSON.parse(String(existing.report || '[]')),
      } satisfies ImportReport;
    }
    const batchId = randomUUID();
    const lines: ImportLine[] = [];
    let accepted = 0;
    let rejected = 0;
    let flagged = 0;
    let merged = 0;
    const createdByEmail = new Map<string, string>();
    const createdByPhone = new Map<string, string>();

    for (const row of prospects) {
      if (row.status === 'rejected') {
        rejected += 1;
        lines.push(row);
        continue;
      }
      if (row.email && await identityIsSuppressed(t, row.email)) {
        rejected += 1;
        lines.push({ line: row.line, status: 'rejected', reason: 'suppressed' });
        continue;
      }
      if (row.phone && await identityIsSuppressed(t, `tel:${row.phone}`)) {
        rejected += 1;
        lines.push({ line: row.line, status: 'rejected', reason: 'suppressed' });
        continue;
      }
      try {
        const versaId = await findByVersa(t, row.versaLeadRef || '');
        const verifiedId = versaId || await findVerified(t, row.email || '', row.phone || '');
        if (verifiedId) {
          const [c] = await t`SELECT stage FROM candidates WHERE id=${verifiedId}`;
          if (isStopped(c)) {
            rejected += 1;
            lines.push({ line: row.line, status: 'rejected', reason: 'suppressed' });
            continue;
          }
          await mergeCandidate(t, actor.email, batchId, verifiedId, row);
          merged += 1;
          accepted += 1;
          lines.push({ line: row.line, status: 'merged', candidateId: verifiedId, reason: versaId ? 'versa_lead_ref' : 'verified_contact' });
          continue;
        }
        const id = await createCandidate(t, actor.email, batchId, row);
        accepted += 1;
        const matches = await unverifiedMatches(t, row.email || '', row.phone || '', id);
        const intra: { id: string; matchOn: 'email' | 'phone' }[] = [];
        if (row.email && createdByEmail.has(row.email) && createdByEmail.get(row.email) !== id) {
          intra.push({ id: createdByEmail.get(row.email) as string, matchOn: 'email' });
        }
        if (row.phone && createdByPhone.has(row.phone) && createdByPhone.get(row.phone) !== id) {
          intra.push({ id: createdByPhone.get(row.phone) as string, matchOn: 'phone' });
        }
        const all = [...matches, ...intra];
        if (all.length) {
          for (const match of all) await flagDuplicate(t, id, match.id, match.matchOn);
          flagged += 1;
          lines.push({ line: row.line, status: 'flagged', candidateId: id, reason: 'possible_duplicate' });
        } else {
          lines.push({ line: row.line, status: 'created', candidateId: id });
        }
        if (row.email) createdByEmail.set(row.email, id);
        if (row.phone) createdByPhone.set(row.phone, id);
      } catch (error) {
        const reason = error instanceof Error && error.message === 'suppressed' ? 'suppressed' : 'import_failed';
        rejected += 1;
        lines.push({ line: row.line, status: 'rejected', reason });
      }
    }

    const safeLines = lines.map((line) => ({
      line: line.line,
      status: line.status,
      reason: line.reason,
      candidateId: line.candidateId,
    }));
    await t`INSERT INTO import_batches(id,file_sha256,actor,filename,accepted,rejected,flagged,merged,report)
      VALUES(${batchId},${parsed.sha256},${actor.email},${filename},${accepted},${rejected},${flagged},${merged},${jsonParam(t, safeLines)})`;
    await audit(t, EVENT_KINDS.csvImported, actor.email, {
      batchId,
      sha256: parsed.sha256,
      accepted,
      rejected,
      flagged,
      merged,
      rows: prospects.length,
    });
    return {
      batchId,
      dryRun: false,
      filename,
      sha256: parsed.sha256,
      idempotent: false,
      accepted,
      rejected,
      flagged,
      merged,
      lines: safeLines,
    } satisfies ImportReport;
  });
}

async function simulate(t: SqlTx, prospects: ImportLine[]) {
  let accepted = 0;
  let rejected = 0;
  let flagged = 0;
  let merged = 0;
  const lines: ImportLine[] = [];
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();
  for (const row of prospects) {
    if (row.status === 'rejected') {
      rejected += 1;
      lines.push({ line: row.line, status: 'rejected', reason: row.reason });
      continue;
    }
    const versaId = await findByVersa(t, row.versaLeadRef || '');
    const verifiedId = versaId || await findVerified(t, row.email || '', row.phone || '');
    if (verifiedId) {
      merged += 1;
      accepted += 1;
      lines.push({ line: row.line, status: 'merged', reason: versaId ? 'versa_lead_ref' : 'verified_contact' });
      continue;
    }
    const matches = await unverifiedMatches(t, row.email || '', row.phone || '');
    const intra = (row.email && seenEmail.has(row.email)) || (row.phone && seenPhone.has(row.phone));
    accepted += 1;
    if (matches.length || intra) {
      flagged += 1;
      lines.push({ line: row.line, status: 'flagged', reason: 'possible_duplicate' });
    } else {
      lines.push({ line: row.line, status: 'created' });
    }
    if (row.email) seenEmail.set(row.email, row.line);
    if (row.phone) seenPhone.set(row.phone, row.line);
  }
  return { accepted, rejected, flagged, merged, lines };
}

export async function createManualLead(
  sql: Sql,
  actor: StaffActor,
  input: {
    name: string;
    email?: string;
    phone?: string;
    source?: string;
    versaLeadRef?: string;
    programInterest?: string;
    consentGranted?: boolean;
    noticeVersion?: string;
  },
) {
  if (actor.role !== 'admin') throw new Error('forbidden');
  const row = parseProspectRow({
    name: input.name,
    email: input.email || '',
    phone: input.phone || '',
    source: input.source || 'manual',
    versa_lead_ref: input.versaLeadRef || '',
    program_interest: input.programInterest || '',
  }, 1);
  if (row.status === 'rejected') throw new Error(row.reason || 'invalid');
  if (input.consentGranted && !(input.noticeVersion || '').trim()) throw new Error('consent_notice_required');
  return sql.begin(async (t: SqlTx) => {
    const versaId = await findByVersa(t, row.versaLeadRef || '');
    const verifiedId = versaId || await findVerified(t, row.email || '', row.phone || '');
    if (verifiedId) throw new Error('duplicate_verified');
    const id = await createCandidate(t, actor.email, 'manual', row);
    const matches = await unverifiedMatches(t, row.email || '', row.phone || '', id);
    for (const match of matches) await flagDuplicate(t, id, match.id, match.matchOn);
    if (input.consentGranted && input.noticeVersion) {
      await t`INSERT INTO candidate_consents(candidate_id,source,purpose,notice_version)
        VALUES(${id},'manual','recruitment',${input.noticeVersion.trim().slice(0, 80)}) ON CONFLICT DO NOTHING`;
      await emit(t, id, EVENT_KINDS.consentGranted, actor.email, { notice: input.noticeVersion.trim().slice(0, 80), via: 'manual' });
    }
    await audit(t, EVENT_KINDS.manualIntake, actor.email, { candidateId: id, flagged: matches.length > 0 });
    return { id, flagged: matches.length > 0 };
  });
}

export async function verifyContact(sql: Sql, actor: StaffActor, id: string, channel: 'email' | 'phone') {
  if (actor.role !== 'admin') throw new Error('forbidden');
  await sql.begin(async (t: SqlTx) => {
    const [c] = await t`SELECT * FROM candidates WHERE id=${id} FOR UPDATE`;
    if (!c) throw new Error('not_found');
    if (channel === 'email') {
      if (!c.email_normalized) throw new Error('invalid');
      await t`UPDATE candidates SET email_verified=true WHERE id=${id}`;
    } else {
      if (!c.phone_normalized) throw new Error('invalid');
      await t`UPDATE candidates SET phone_verified=true WHERE id=${id}`;
    }
    await emit(t, id, EVENT_KINDS.identityVerified, actor.email, { channel });
  });
}

export async function dismissDuplicate(sql: Sql, actor: StaffActor, id: string) {
  if (actor.role !== 'admin') throw new Error('forbidden');
  const rows = await sql`UPDATE candidate_duplicate_flags SET status='dismissed' WHERE id=${id} AND status='needs_review' RETURNING id`;
  if (!rows.length) throw new Error('not_found');
}

export async function listDuplicateFlags(sql: Sql, actor: StaffActor) {
  if (actor.role !== 'admin') return [];
  const rows = await sql`
    SELECT d.id, d.match_on, d.status, d.left_candidate_id, d.right_candidate_id,
      l.name AS left_name, r.name AS right_name
    FROM candidate_duplicate_flags d
    JOIN candidates l ON l.id = d.left_candidate_id
    JOIN candidates r ON r.id = d.right_candidate_id
    WHERE d.status='needs_review'
    ORDER BY d.created_at DESC
    LIMIT 50`;
  return rows.map((row: Record<string, unknown>) => ({
    id: String(row.id),
    matchOn: String(row.match_on),
    leftId: String(row.left_candidate_id),
    rightId: String(row.right_candidate_id),
    leftName: String(row.left_name),
    rightName: String(row.right_name),
  }));
}
