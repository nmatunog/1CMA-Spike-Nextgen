import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { applyAllMigrations, resetWorkflowTables, WORKFLOW_RESET_TABLES } from '../gia/apply-migrations.mjs';
import { captureProspect } from '../recruitment/import';
import { getCandidate, saveFollowUp, type Sql } from '../recruitment/store';
import { applyCandidateStop } from '../recruitment/suppression';
import {
  applyAiaRegistration,
  AIA_EVENT_KINDS,
  AIA_LEADER_TASK,
  AIA_STAFF_REFERENCE_PAGES,
  candidateAiaHandoff,
  deriveAiaRegistration,
} from './aia-registration';
function syntheticAiaRegistrationUrl(code = '000000000', name = 'TEST/RECRUITER') {
  const reference = Buffer.from(JSON.stringify({ code, name }), 'utf8').toString('base64');
  return `https://www.aia.com.ph/en/financialadvisor/join-us-now?reference=${reference}`;
}
import { ingestGiaEngagementEvent, recordGiaVisitorEngagement } from './engage';
import { enrollAccount, provisionUserAccount, submitEvaluation, loadActiveEvaluationConfig } from './index';
import type { StaffActor } from '../recruitment/types';

const state = { db: null as unknown as PGlite };
const admin: StaffActor = { email: 'admin@example.test', role: 'admin' };
const leader: StaffActor = { email: 'leader@example.test', role: 'leader' };
const otherLeader: StaffActor = { email: 'other-leader@example.test', role: 'leader' };
const defaultRecruiter: StaffActor = { email: 'nilo-default@example.test', role: 'leader' };
const SYNTHETIC_DEFAULT_URL = syntheticAiaRegistrationUrl('000000000', 'TEST/RECRUITER');
const SYNTHETIC_LEADER_URL = syntheticAiaRegistrationUrl('000000001', 'TEST/LEADER');

function tag(db: PGlite): Sql {
  const query = async (parts: TemplateStringsArray, ...args: unknown[]) => {
    const text = parts.reduce((s, p, i) => s + p + (i < args.length ? `$${i + 1}` : ''), '');
    return (await db.query(text, args)).rows as Record<string, unknown>[];
  };
  query.json = (v: unknown) => JSON.stringify(v);
  query.begin = async <T,>(fn: (tx: Sql) => Promise<T>) => db.transaction((tx) => fn(tag(tx as unknown as PGlite))) as Promise<T>;
  return query as unknown as Sql;
}

async function q(sql: string, params: unknown[] = []) {
  return (await state.db.query(sql, params)).rows as Record<string, unknown>[];
}

const BASE_ANSWERS = {
  background: 'Synthetic AIA background',
  education: 'Synthetic college',
  motivation: 'Advisor path after FEP',
  readiness: 'Evenings Asia/Manila',
  outcome: 'proceed',
  recommended_next_action: 'leader_conversation',
};

async function seedAdvisor(name: string, email: string, interest = 'ra_spike', consent = false) {
  const sql = tag(state.db);
  const captured = await captureProspect(sql, admin, {
    name,
    email,
    programInterest: interest,
    ...(consent ? { consentGranted: true, noticeVersion: 'mvp01-notice-1' } : {}),
  });
  await saveFollowUp(sql, admin, {
    id: captured.id,
    stage: 'fep_attended',
    assignedLeader: leader.email,
    nextAction: 'Post-FEP review',
    dueAtProvided: false,
    resolution: '',
    generalAnswer: '',
    giaCouldAnswer: false,
    resolve: false,
  });
  const config = await loadActiveEvaluationConfig(sql);
  await submitEvaluation(sql, admin, {
    candidateId: captured.id,
    configId: config.id,
    configVersion: config.version,
    answers: { ...BASE_ANSWERS, program_interest: interest },
  });
  return captured.id;
}

async function seedUnassigned(name: string, email: string, interest = 'ra_spike') {
  const sql = tag(state.db);
  const captured = await captureProspect(sql, admin, { name, email, programInterest: interest });
  await saveFollowUp(sql, admin, {
    id: captured.id,
    stage: 'fep_attended',
    assignedLeader: '',
    nextAction: 'Unassigned after FEP',
    dueAtProvided: false,
    resolution: '',
    generalAnswer: '',
    giaCouldAnswer: false,
    resolve: false,
  });
  const config = await loadActiveEvaluationConfig(sql);
  await submitEvaluation(sql, admin, {
    candidateId: captured.id,
    configId: config.id,
    configVersion: config.version,
    answers: { ...BASE_ANSWERS, program_interest: interest },
  });
  return captured.id;
}

describe('Official AIA registration milestone', () => {
  beforeAll(async () => {
    process.env.RECRUITMENT_STAFF_ROLES = JSON.stringify({
      'admin@example.test': 'admin',
      'leader@example.test': 'leader',
      'other-leader@example.test': 'leader',
      'nilo-default@example.test': 'leader',
    });
    process.env.AIA_DEFAULT_RECRUITER_STAFF_ID = defaultRecruiter.email;
    process.env.AIA_DEFAULT_RECRUITER_REGISTRATION_URL = SYNTHETIC_DEFAULT_URL;
    process.env.AIA_RECRUITER_REGISTRATION_URLS = JSON.stringify({
      [leader.email]: SYNTHETIC_LEADER_URL,
    });
    state.db = new PGlite();
    await state.db.exec('CREATE TABLE candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),name text NOT NULL,email text NOT NULL,phone text NOT NULL,score integer NOT NULL,created_at timestamptz DEFAULT now());');
    await applyAllMigrations((sql: string) => state.db.exec(sql));
  });
  beforeEach(async () => {
    await resetWorkflowTables((sql: string) => state.db.exec(sql), WORKFLOW_RESET_TABLES);
  });
  afterAll(async () => { await state.db.close(); });

  it('blocks registration handoff until recruiter attribution is confirmed and keeps that recruiter', async () => {
    const sql = tag(state.db);
    const id = await seedAdvisor('Synthetic AIA Attr', 'aia-attr@example.test');
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'pending', source: 'self_report',
    })).rejects.toThrow(/attribution_missing/);
    const confirmed = await applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'confirm_attribution', referralSource: 'FEP session introducer',
    });
    expect(confirmed.recruiterEmail).toBe(leader.email);
    expect(confirmed.leaderTask).toBe(AIA_LEADER_TASK);
    expect(confirmed.attributionSource).toBe('assigned_recruiter');
    expect(confirmed.registrationUrl).toBe(`${SYNTHETIC_LEADER_URL}&scroll=1`);
    const [row] = await q('SELECT assigned_leader, next_action, stage, spike_paid FROM candidates WHERE id=$1', [id]);
    expect(row.assigned_leader).toBe(leader.email);
    expect(row.next_action).toBe(AIA_LEADER_TASK);
    expect(row.stage).toBe('fep_attended');
    expect(row.spike_paid).toBe(false);
    const pending = await applyAiaRegistration(sql, leader, {
      candidateId: id, action: 'pending', source: 'self_report',
    });
    expect(pending.status).toBe('aia_registration_pending');
    expect(pending.recruiterEmail).toBe(leader.email);
    await saveFollowUp(sql, admin, {
      id, stage: 'fep_attended', assignedLeader: otherLeader.email, nextAction: AIA_LEADER_TASK,
      dueAtProvided: false, resolution: '', generalAnswer: '', giaCouldAnswer: false, resolve: false,
    });
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'submitted', source: 'staff',
    })).rejects.toThrow(/attribution_stale/);
    await applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'confirm_attribution', referralSource: 'Reassigned introducer',
    });
    const submitted = await applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'submitted', source: 'staff',
    });
    expect(submitted.recruiterEmail).toBe(otherLeader.email);
    const events = await q("SELECT kind, metadata::text AS m FROM candidate_events WHERE candidate_id=$1 AND kind LIKE 'aia.%' ORDER BY created_at", [id]);
    expect(events.map((row) => row.kind)).toEqual([
      AIA_EVENT_KINDS.attributionConfirmed,
      AIA_EVENT_KINDS.pending,
      AIA_EVENT_KINDS.attributionConfirmed,
      AIA_EVENT_KINDS.submitted,
    ]);
    expect(String(events[3].m)).toMatch(/other-leader@example.test/);
    expect(String(events[3].m)).not.toMatch(/aia-attr@example.test/);
  });

  it('never treats pending or a candidate self-report as submitted or verified', async () => {
    const sql = tag(state.db);
    const id = await seedAdvisor('Synthetic AIA Pending', 'aia-pending@example.test');
    await applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'confirm_attribution', referralSource: 'Leader intro',
    });
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'submitted', source: 'self_report',
    })).rejects.toThrow(/invalid/);
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'verified', source: 'self_report',
    })).rejects.toThrow(/invalid/);
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'verified', source: 'staff',
    })).rejects.toThrow(/invalid/);
    const pending = await applyAiaRegistration(sql, leader, {
      candidateId: id, action: 'pending', source: 'self_report',
    });
    expect(pending.status).toBe('aia_registration_pending');
    const kinds = (await q("SELECT kind FROM candidate_events WHERE candidate_id=$1 AND kind LIKE 'aia.registration.%'", [id])).map((row) => row.kind);
    expect(kinds).toEqual([AIA_EVENT_KINDS.pending]);
    expect(kinds).not.toContain(AIA_EVENT_KINDS.submitted);
    expect(kinds).not.toContain(AIA_EVENT_KINDS.verified);
    const detail = await getCandidate(sql, admin, id);
    expect(detail?.candidate.aia_registration_status).toBe('aia_registration_pending');
  });

  it('requires staff role checks for submitted and verified', async () => {
    const sql = tag(state.db);
    const id = await seedAdvisor('Synthetic AIA Roles', 'aia-roles@example.test');
    await applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'confirm_attribution', referralSource: 'FEP introducer',
    });
    await expect(applyAiaRegistration(sql, otherLeader, {
      candidateId: id, action: 'pending', source: 'self_report',
    })).rejects.toThrow(/forbidden/);
    await applyAiaRegistration(sql, leader, {
      candidateId: id, action: 'pending', source: 'self_report',
    });
    await applyAiaRegistration(sql, leader, {
      candidateId: id, action: 'submitted', source: 'staff',
    });
    const verified = await applyAiaRegistration(sql, leader, {
      candidateId: id, action: 'verified', source: 'staff',
    });
    expect(verified.status).toBe('aia_registration_verified');
    const [event] = await q("SELECT metadata::text AS m, actor FROM candidate_events WHERE candidate_id=$1 AND kind=$2", [id, AIA_EVENT_KINDS.verified]);
    expect(event.actor).toBe(leader.email);
    expect(String(event.m)).toMatch(/"verifiedBy"\s*:\s*"leader@example.test"/);
    expect(String(event.m)).toMatch(/verifiedAt/);
    await expect(applyAiaRegistration(sql, otherLeader, {
      candidateId: id, action: 'verified', source: 'staff',
    })).rejects.toThrow(/forbidden/);
  });

  it('leaves interns and free learners unaffected', async () => {
    const sql = tag(state.db);
    const intern = await seedAdvisor('Synthetic Intern AIA', 'aia-intern@example.test', 'intern');
    const literacy = await seedAdvisor('Synthetic Literacy AIA', 'aia-lit@example.test', 'literacy');
    const fep = await seedAdvisor('Synthetic FEP AIA', 'aia-fep@example.test', 'fep');
    for (const id of [intern, literacy, fep]) {
      await expect(applyAiaRegistration(sql, admin, {
        candidateId: id, action: 'confirm_attribution', referralSource: 'Should not apply',
      })).rejects.toThrow(/not_aia_pathway/);
      expect(await q("SELECT 1 FROM candidate_events WHERE candidate_id=$1 AND kind LIKE 'aia.%'", [id])).toHaveLength(0);
      const [row] = await q('SELECT stage, spike_paid, literacy_status FROM candidates WHERE id=$1', [id]);
      expect(row.stage).toBe('fep_attended');
      expect(row.spike_paid).toBe(false);
    }
  });

  it('does not grant entitlements and Versa/paid flags never imply AIA registration', async () => {
    const sql = tag(state.db);
    const id = await seedAdvisor('Synthetic AIA Entitlements', 'aia-ent@example.test');
    await saveFollowUp(sql, admin, {
      id, stage: 'fep_attended', assignedLeader: leader.email, nextAction: 'Paid later',
      dueAtProvided: false, resolution: '', generalAnswer: '', giaCouldAnswer: false, resolve: false,
      spikePaid: true, spikePaidProvided: true,
    });
    await q('UPDATE candidates SET versa_lead_ref=$2 WHERE id=$1', [id, 'vlr-synthetic-01']);
    const before = await getCandidate(sql, admin, id);
    expect(before?.candidate.spike_paid).toBe(true);
    expect(before?.candidate.versa_lead_ref).toBe('vlr-synthetic-01');
    expect(before?.candidate.aia_registration_status).toBeNull();
    expect(await q("SELECT 1 FROM candidate_events WHERE candidate_id=$1 AND kind LIKE 'aia.%'", [id])).toHaveLength(0);
    await applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'confirm_attribution', referralSource: 'FEP introducer',
    });
    await applyAiaRegistration(sql, admin, { candidateId: id, action: 'pending', source: 'self_report' });
    await applyAiaRegistration(sql, admin, { candidateId: id, action: 'submitted', source: 'staff' });
    const verified = await applyAiaRegistration(sql, admin, { candidateId: id, action: 'verified', source: 'staff' });
    expect(verified.stage).toBe('fep_attended');
    expect(verified.spikePaid).toBe(true);
    const [row] = await q('SELECT stage, spike_paid, literacy_status FROM candidates WHERE id=$1', [id]);
    expect(row.stage).toBe('fep_attended');
    expect(row.spike_paid).toBe(true);
    expect(row.literacy_status).not.toBe('completed');
    expect(await q('SELECT 1 FROM user_accounts WHERE candidate_id=$1', [id])).toHaveLength(0);
    expect(await q('SELECT 1 FROM program_enrollments', [])).toHaveLength(0);
    const account = await provisionUserAccount(sql, id);
    const enrollment = await enrollAccount(sql, account.id, 'literacy');
    expect(enrollment.programCode).toBe('literacy');
    expect(await q("SELECT 1 FROM candidate_events WHERE candidate_id=$1 AND kind IN ('stage.changed') AND metadata->>'to' IN ('irecruit_started','licensing','coded','activated')", [id])).toHaveLength(0);
  });

  it('requires confirmed FEP attendance, keeps STOP, and refuses GIA auto-completion', async () => {
    const sql = tag(state.db);
    const captured = await captureProspect(sql, admin, { name: 'Synthetic AIA Pre-FEP', email: 'aia-prefep@example.test', programInterest: 'ra_spike' });
    await saveFollowUp(sql, admin, {
      id: captured.id, stage: 'fep_booked', assignedLeader: leader.email, nextAction: 'Attend FEP',
      dueAtProvided: false, resolution: '', generalAnswer: '', giaCouldAnswer: false, resolve: false,
    });
    const config = await loadActiveEvaluationConfig(sql);
    await submitEvaluation(sql, admin, {
      candidateId: captured.id, configId: config.id, configVersion: config.version,
      answers: { ...BASE_ANSWERS, program_interest: 'ra_spike' },
    });
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: captured.id, action: 'confirm_attribution', referralSource: 'Too early',
    })).rejects.toThrow(/fep_attendance_required/);
    await ingestGiaEngagementEvent(sql, admin, { candidateId: captured.id, kind: 'fep.attended', actor: admin.email });
    await applyAiaRegistration(sql, admin, {
      candidateId: captured.id, action: 'confirm_attribution', referralSource: 'After FEP attendance event',
    });
    await expect(recordGiaVisitorEngagement(sql, {
      candidateId: captured.id, kind: 'aia.registration.verified' as 'gia.conversation', actor: 'gia',
    })).rejects.toThrow(/invalid/);
    await sql.begin(async (tx: Sql) => {
      await applyCandidateStop(tx, { candidateId: captured.id, actor: admin.email, currentStage: 'fep_booked' });
    });
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: captured.id, action: 'pending', source: 'self_report',
    })).rejects.toThrow(/suppressed/);
  });

  it('falls back to the configured default recruiter only on the AIA advisor path and records it', async () => {
    const sql = tag(state.db);
    const advisor = await seedUnassigned('Synthetic AIA Default', 'aia-default@example.test');
    const intern = await seedUnassigned('Synthetic Intern Default', 'aia-intern-default@example.test', 'intern');
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: intern, action: 'confirm_attribution', referralSource: 'Should not apply',
    })).rejects.toThrow(/not_aia_pathway/);
    expect((await q('SELECT assigned_leader FROM candidates WHERE id=$1', [intern]))[0].assigned_leader).toBeNull();
    expect(await q("SELECT 1 FROM candidate_events WHERE candidate_id=$1 AND kind LIKE 'aia.%'", [intern])).toHaveLength(0);
    const confirmed = await applyAiaRegistration(sql, admin, {
      candidateId: advisor, action: 'confirm_attribution',
    });
    expect(confirmed.attributionSource).toBe('default_recruiter');
    expect(confirmed.recruiterEmail).toBe(defaultRecruiter.email);
    expect(confirmed.registrationUrl).toBe(`${SYNTHETIC_DEFAULT_URL}&scroll=1`);
    const [row] = await q('SELECT assigned_leader FROM candidates WHERE id=$1', [advisor]);
    expect(row.assigned_leader).toBe(defaultRecruiter.email);
    const [event] = await q("SELECT metadata::text AS m FROM candidate_events WHERE candidate_id=$1 AND kind=$2", [advisor, AIA_EVENT_KINDS.attributionConfirmed]);
    expect(String(event.m)).toMatch(/"attributionSource"\s*:\s*"default_recruiter"/);
    const detail = await getCandidate(sql, admin, advisor);
    expect(detail?.candidate.aia_attribution?.attributionSource).toBe('default_recruiter');
    expect(detail?.candidate.aia_registration_url).toBe(`${SYNTHETIC_DEFAULT_URL}&scroll=1`);
  });

  it('lets a candidate click on an unassigned advisor create pending only via default recruiter', async () => {
    const sql = tag(state.db);
    const id = await seedUnassigned('Synthetic AIA Click', 'aia-click@example.test');
    const pending = await applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'pending', source: 'self_report',
    });
    expect(pending.status).toBe('aia_registration_pending');
    expect(pending.attributionSource).toBe('default_recruiter');
    expect(pending.registrationUrl).toBe(`${SYNTHETIC_DEFAULT_URL}&scroll=1`);
    const kinds = (await q("SELECT kind FROM candidate_events WHERE candidate_id=$1 AND kind LIKE 'aia.%' ORDER BY created_at", [id])).map((row) => row.kind);
    expect(kinds).toEqual([AIA_EVENT_KINDS.attributionConfirmed, AIA_EVENT_KINDS.pending]);
    expect(kinds).not.toContain(AIA_EVENT_KINDS.submitted);
    expect(kinds).not.toContain(AIA_EVENT_KINDS.verified);
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'submitted', source: 'self_report',
    })).rejects.toThrow(/invalid/);
  });

  it('never emits a generic AIA URL in candidate-facing handoff output', async () => {
    const sql = tag(state.db);
    const id = await seedAdvisor('Synthetic AIA Generic', 'aia-generic@example.test');
    const confirmed = await applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'confirm_attribution', referralSource: 'Leader intro',
    });
    const facing = candidateAiaHandoff({
      attributed: true,
      registrationUrl: confirmed.registrationUrl,
    });
    expect(facing.registrationUrl).toBe(`${SYNTHETIC_LEADER_URL}&scroll=1`);
    expect(JSON.stringify(facing)).not.toContain('https://www.aia.com.ph/en/financialadvisor/join-us-now"');
    expect(JSON.stringify(facing)).not.toMatch(/join-us-now(?!\?reference=)/);
    expect(JSON.stringify(facing)).not.toMatch(/TEST\/LEADER/);
    const other = await seedAdvisor('Synthetic AIA No URL', 'aia-nolink@example.test');
    await saveFollowUp(sql, admin, {
      id: other, stage: 'fep_attended', assignedLeader: otherLeader.email, nextAction: AIA_LEADER_TASK,
      dueAtProvided: false, resolution: '', generalAnswer: '', giaCouldAnswer: false, resolve: false,
    });
    const taskOnly = await applyAiaRegistration(sql, admin, {
      candidateId: other, action: 'confirm_attribution', referralSource: 'Other leader',
    });
    expect(taskOnly.registrationUrl).toBeNull();
    expect(taskOnly.leaderTask).toBe(AIA_LEADER_TASK);
  });

  it('shows recruiter-assisted fields only to admin/assigned leader when consent is granted', async () => {
    const sql = tag(state.db);
    const unknown = await seedAdvisor('Synthetic AIA Assist Unknown', 'aia-assist-unknown@example.test');
    await applyAiaRegistration(sql, admin, {
      candidateId: unknown, action: 'confirm_attribution', referralSource: 'Leader intro',
    });
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: unknown, action: 'open_assisted',
    })).rejects.toThrow(/consent_required/);
    expect(await q("SELECT 1 FROM candidate_events WHERE candidate_id=$1 AND kind LIKE 'aia.assisted.%'", [unknown])).toHaveLength(0);

    const id = await seedAdvisor('Synthetic Ada Recruiter', 'aia-assist@example.test', 'ra_spike', true);
    await applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'confirm_attribution', referralSource: 'Leader intro',
    });
    const opened = await applyAiaRegistration(sql, leader, { candidateId: id, action: 'open_assisted' }) as {
      statusUnchanged: boolean;
      fields: Array<{ id: string; value: string; captured: boolean }>;
    };
    expect(opened.statusUnchanged).toBe(true);
    expect(opened.fields.map((field) => field.id)).toEqual([
      'honorifics', 'first_name', 'last_name', 'date_of_birth', 'email', 'mobile', 'applying_to_be', 'preferred_location',
    ]);
    expect(opened.fields[1].value).toBe('Synthetic');
    expect(opened.fields[0].captured).toBe(false);
    expect(opened.fields[3].captured).toBe(false);
    expect(JSON.stringify(opened.fields)).not.toMatch(/password|credential|agent code/i);
    await expect(applyAiaRegistration(sql, otherLeader, {
      candidateId: id, action: 'open_assisted',
    })).rejects.toThrow(/forbidden/);
    const copied = await applyAiaRegistration(sql, leader, {
      candidateId: id, action: 'copy_field', fieldId: 'email',
    });
    expect(copied.statusUnchanged).toBe(true);
    const [copyEvent] = await q("SELECT metadata::text AS m FROM candidate_events WHERE candidate_id=$1 AND kind=$2", [id, AIA_EVENT_KINDS.assistedCopied]);
    expect(String(copyEvent.m)).toMatch(/"fieldId"\s*:\s*"email"/);
    expect(String(copyEvent.m)).not.toMatch(/aia-assist@example.test/);
    const kinds = (await q("SELECT kind FROM candidate_events WHERE candidate_id=$1 AND kind LIKE 'aia.registration.%'", [id])).map((row) => row.kind);
    expect(kinds).toEqual([]);
    await sql.begin(async (tx: Sql) => {
      await applyCandidateStop(tx, { candidateId: id, actor: admin.email, currentStage: 'fep_attended' });
    });
    await expect(applyAiaRegistration(sql, admin, {
      candidateId: id, action: 'open_assisted',
    })).rejects.toThrow(/suppressed/);
  });

  it('documents staff-reference AIA pages as do-not-send and does not add a migration', () => {
    expect([...AIA_STAFF_REFERENCE_PAGES]).toEqual([
      'https://www.aia.com.ph/en/financialadvisor/partner-with-the-best',
      'https://www.aia.com.ph/en/financialadvisor/join-us-now',
    ]);
    const docs = readFileSync('docs/mvp01/aia-registration.md', 'utf8');
    expect(docs).toMatch(/Help candidate register via your AIA account \/ iRecruit/);
    expect(docs).toMatch(/mermaid/);
    expect(docs).toMatch(/do not send to recruits/i);
    expect(docs).toContain(AIA_STAFF_REFERENCE_PAGES[0]);
    expect(docs).toContain(AIA_STAFF_REFERENCE_PAGES[1]);
    const migrations = readdirSync('migrations').filter((name) => /^\d+.*\.sql$/.test(name));
    expect(migrations.some((name) => name.startsWith('0012'))).toBe(false);
    const panel = readFileSync('app/recruitment/command/panel.tsx', 'utf8');
    expect(panel).not.toContain('https://www.aia.com.ph/en/financialadvisor/join-us-now');
    expect(panel).not.toMatch(/atob|JSON\.parse\(.*reference/);
    const cfg = readFileSync('lib/mvp01/aia-recruiter-config.ts', 'utf8');
    expect(cfg).not.toMatch(/atob|Buffer\.from\(/);
    expect(cfg).not.toMatch(/searchParams\.get\('reference'\)[\s\S]{0,120}JSON\.parse/);
    expect(deriveAiaRegistration([]).status).toBeNull();
  });
});
