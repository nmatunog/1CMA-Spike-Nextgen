'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { WRITABLE_STAGES, LITERACY_STATUSES, STOP_STAGE, ENGAGEMENT_OUTCOMES } from '@/lib/recruitment/stages';
import { formatManilaStamp, manilaDaysAgo, manilaToday, toManilaDateTimeLocal } from '@/lib/recruitment/time';
import type { AuditEvent, CandidateDetail, DashboardCounts, DuplicateFlag, HandoffQueueItem, ImportReport, QueueCandidate } from '@/lib/recruitment/types';
import { COMM_CHANNELS, GIA_ENGAGEMENT_KINDS } from '@/lib/mvp01/interfaces';
import { AIA_LEADER_TASK, isAiaAdvisorPathway } from '@/lib/mvp01/aia-model';
import type { EvaluationFormConfig } from '@/lib/mvp01/evaluation-config';
import styles from './command.module.css';

type Payload = {
  role: 'admin' | 'leader';
  timezone: string;
  dashboard: DashboardCounts;
  candidates: QueueCandidate[];
  handoffs: HandoffQueueItem[];
  sources: string[];
  duplicates?: DuplicateFlag[];
  evaluationConfig?: EvaluationFormConfig;
  leaders: { email: string; role: string }[];
};

const METRICS: { key: keyof DashboardCounts; label: string }[] = [
  { key: 'newLeads', label: 'New leads' },
  { key: 'contacted', label: 'Contacted' },
  { key: 'fepBooked', label: 'FEP booked' },
  { key: 'fepAttended', label: 'FEP attended' },
  { key: 'applications', label: 'Applications' },
  { key: 'coded', label: 'Coded' },
  { key: 'activated', label: 'Activated' },
  { key: 'evaluated', label: 'Evaluated' },
  { key: 'engaged', label: 'Engaged' },
  { key: 'captured', label: 'Captured' },
  { key: 'registered', label: 'Registered (current window)' },
  { key: 'duplicatePairs', label: 'Duplicate pairs (current)' },
  { key: 'unassigned', label: 'Unassigned (current)' },
  { key: 'overdueFollowups', label: 'Overdue follow-ups (current)' },
  { key: 'awaitingEvaluation', label: 'Awaiting evaluation (current)' },
];

export default function Command() {
  const [data, setData] = useState<Payload | null>(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ candidate: CandidateDetail; events: AuditEvent[] } | null>(null);
  const [from, setFrom] = useState(manilaDaysAgo(30));
  const [to, setTo] = useState(manilaToday());
  const [source, setSource] = useState('');
  const [leader, setLeader] = useState('');
  const [q, setQ] = useState('');
  const [stage, setStage] = useState('');
  const [confirmStop, setConfirmStop] = useState(false);
  const [importReport, setImportReport] = useState<ImportReport | null>(null);

  const query = useMemo(() => {
    const params = new URLSearchParams({ from, to, source, leader, q, stage });
    return params.toString();
  }, [from, to, source, leader, q, stage]);

  const load = useCallback(async (opts?: { keepMessage?: boolean }) => {
    const r = await fetch(`/api/recruitment/command?${query}`, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) {
      setMessage(d.error || 'Unable to load');
      return false;
    }
    setData(d);
    if (!opts?.keepMessage) setMessage('');
    return true;
  }, [query]);

  async function loadDetail(id: string) {
    const r = await fetch(`/api/recruitment/command/${id}`, { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) {
      setMessage(d.error === 'forbidden' ? 'Not assigned to you' : 'Unable to load record');
      setDetail(null);
      return;
    }
    setDetail(d);
  }

  useEffect(() => { load().catch(() => setMessage('Service unavailable')); }, [load]);
  useEffect(() => {
    if (!selected) {
      setDetail(null);
      setConfirmStop(false);
      return;
    }
    loadDetail(selected).catch(() => setMessage('Service unavailable'));
  }, [selected]);

  async function update(e: React.FormEvent<HTMLFormElement>, row: CandidateDetail) {
    e.preventDefault();
    setBusy(true);
    setConfirmStop(false);
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/recruitment/command', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: row.id,
          handoffId: row.handoff_id,
          stage: f.get('stage'),
          assignedLeader: f.get('leader'),
          nextAction: f.get('next'),
          engagementOutcome: f.get('outcome') || '',
          dueAt: f.get('due') || null,
          resolution: f.get('resolution') || '',
          giaCouldAnswer: f.get('learn') === 'on',
          generalAnswer: f.get('answer') || '',
          resolve: f.get('resolve') === 'on',
          literacyStatus: f.get('literacy'),
          ...(data?.role === 'admin' ? { spikePaid: f.get('paid') === 'on' } : {}),
        }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) {
        setMessage(d.error === 'suppressed' ? 'STOP is in effect; stage changes cannot undo it' : 'Update failed');
      } else {
        await load({ keepMessage: true });
        await loadDetail(row.id);
        setMessage('Follow-up saved');
      }
    } catch {
      setMessage('Service unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function applyStop(id: string) {
    setBusy(true);
    try {
      const r = await fetch('/api/recruitment/command/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      setConfirmStop(false);
      if (!r.ok) {
        setMessage('STOP failed');
      } else {
        await load({ keepMessage: true });
        await loadDetail(id);
        setMessage('Global STOP applied on all channels');
      }
    } catch {
      setMessage('Service unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function evaluate(e: React.FormEvent<HTMLFormElement>, row: CandidateDetail) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const answers: Record<string, string> = {};
    for (const [key, value] of f.entries()) {
      if (key === 'configId' || key === 'configVersion') continue;
      answers[key] = String(value);
    }
    try {
      const { ok, d } = await postJson('/api/recruitment/command/evaluate', {
        id: row.id,
        configId: f.get('configId'),
        configVersion: Number(f.get('configVersion')),
        answers,
      });
      if (!ok) {
        setMessage(d.error === 'suppressed' ? 'STOP is in effect; evaluation cannot continue outreach' : d.error === 'forbidden' ? 'Not assigned to you' : 'Evaluation failed');
      } else {
        await load({ keepMessage: true });
        await loadDetail(row.id);
        setMessage('Evaluation saved');
      }
    } catch {
      setMessage('Service unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function recordAia(e: React.FormEvent<HTMLFormElement>, row: CandidateDetail) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value || String(f.get('aiaAction') || '');
    try {
      const { ok, d } = await postJson('/api/recruitment/command/aia-registration', {
        id: row.id,
        action,
        referralSource: String(f.get('referralSource') || row.aia_attribution?.referralSource || ''),
        source: action === 'pending' ? 'self_report' : 'staff',
      });
      if (!ok) {
        const errors: Record<string, string> = {
          attribution_missing: 'Confirm assigned recruiter/introducer before any AIA registration handoff',
          attribution_stale: 'Recruiter assignment changed; confirm attribution again',
          not_aia_pathway: 'AIA registration applies only to the AIA advisor path',
          fep_attendance_required: 'Confirmed FEP attendance is required first',
          forbidden: 'Not assigned to you',
          suppressed: 'STOP is in effect',
        };
        setMessage(errors[String(d.error)] || 'AIA registration update failed');
      } else {
        await load({ keepMessage: true });
        await loadDetail(row.id);
        setMessage(action === 'confirm_attribution' ? 'Recruiter attribution confirmed' : `AIA registration ${action}`);
      }
    } catch {
      setMessage('Service unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function recordGiaEvent(e: React.FormEvent<HTMLFormElement>, row: CandidateDetail) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const { ok, d } = await postJson('/api/recruitment/command/engagement', {
        candidateId: row.id,
        kind: f.get('giaKind'),
        metadata: { intent: String(f.get('giaIntent') || 'synthetic'), citation: String(f.get('giaCitation') || '') },
      });
      if (!ok) {
        setMessage(d.error === 'suppressed' ? 'STOP is in effect' : 'GIA event failed');
      } else {
        await load({ keepMessage: true });
        await loadDetail(row.id);
        setMessage('GIA engagement event recorded');
      }
    } catch {
      setMessage('Service unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function postJson(url: string, body: unknown) {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const d = await r.json().catch(() => ({}));
    return { ok: r.ok, d, r };
  }

  async function importCsv(file: File, dryRun: boolean) {
    setBusy(true);
    try {
      const csv = await file.text();
      const { ok, d } = await postJson('/api/recruitment/command/import', { csv, filename: file.name, dryRun });
      if (!ok) {
        setMessage(d.error === 'forbidden_secret_column' ? 'CSV rejected: secret/code columns are not allowed' : 'Import failed');
        return;
      }
      setImportReport(d as ImportReport);
      if (!dryRun) await load({ keepMessage: true });
      setMessage(d.idempotent ? 'Repeat import had no effect' : dryRun ? 'Dry run complete' : `Import ${d.batchId.slice(0, 8)} accepted ${d.accepted}`);
    } catch {
      setMessage('Service unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function intake(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const channelPrefs: Record<string, boolean> = {};
      for (const channel of COMM_CHANNELS) {
        channelPrefs[channel] = f.get(`ipref_${channel}`) === 'on';
      }
      const { ok, d } = await postJson('/api/recruitment/command/intake', {
        name: f.get('iname'),
        email: f.get('iemail'),
        phone: f.get('iphone'),
        source: f.get('isource') || 'manual',
        campaign: f.get('icampaign') || '',
        versaLeadRef: f.get('ivlr'),
        programInterest: f.get('iinterest'),
        consentGranted: f.get('iconsent') === 'on',
        noticeVersion: f.get('inotice') || '',
        channelPrefs,
      });
      setMessage(ok ? 'Manual lead saved' : d.error === 'duplicate_verified' ? 'Verified identity already exists' : 'Intake failed');
      if (ok) {
        (e.target as HTMLFormElement).reset();
        await load({ keepMessage: true });
      }
    } catch {
      setMessage('Service unavailable');
    } finally {
      setBusy(false);
    }
  }

  async function exportCsv() {
    setBusy(true);
    try {
      const r = await fetch('/api/recruitment/command/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, leader, q, stage }),
      });
      if (!r.ok) {
        setMessage('Export failed');
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'command-export.csv';
      a.click();
      URL.revokeObjectURL(url);
      setMessage('Export downloaded');
    } catch {
      setMessage('Service unavailable');
    } finally {
      setBusy(false);
    }
  }

  const row = detail?.candidate;
  const stopped = row?.stage === STOP_STAGE;

  return (
    <main className={styles.shell}>
      <h1>Recruitment Command Center</h1>
      <p className={styles.lede}>Synthetic pilot · Event-derived dashboard (Asia/Manila) · Shared candidate queue</p>
      <p className={styles.status} role="status">{message}</p>
      <div className={styles.toolbar}>
        <button type="button" onClick={() => load()}>Refresh</button>
        {data?.role === 'admin' && <a href="/recruitment/capture">Capture prospect</a>}
        {data && <span className={styles.meta}>Signed in as {data.role} · {data.timezone}</span>}
      </div>

      <form className={styles.filters} onSubmit={(e) => { e.preventDefault(); load(); }}>
        <label className={styles.field}>From (Manila)
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className={styles.field}>To (Manila)
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
        <label className={styles.field}>Source
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">All sources</option>
            {(data?.sources || []).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        {data?.role === 'admin' && (
          <label className={styles.field}>Leader
            <select value={leader} onChange={(e) => setLeader(e.target.value)}>
              <option value="">All leaders</option>
              {data.leaders.map((l) => <option key={l.email} value={l.email}>{l.email}</option>)}
            </select>
          </label>
        )}
        <label className={`${styles.field} ${styles.search}`}>Search name
          <input value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} placeholder="Candidate name" />
        </label>
        <label className={styles.field}>Stage
          <select value={stage} onChange={(e) => setStage(e.target.value)}>
            <option value="">All stages</option>
            {[...WRITABLE_STAGES, STOP_STAGE].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <button type="submit">Apply filters</button>
      </form>

      <h2>Dashboard</h2>
      <p className={styles.meta}>Event counts use the Manila date filter. Unassigned and overdue are current snapshots and ignore that window.</p>
      <dl className={styles.metrics}>
        {METRICS.map((m) => (
          <div className={styles.metric} key={m.key}>
            <dt>{m.label}</dt>
            <dd>{data?.dashboard[m.key] ?? 0}</dd>
          </div>
        ))}
      </dl>

      <div className={styles.toolbar}>
        <button type="button" disabled={busy} onClick={() => exportCsv()}>Export CSV</button>
        <span className={styles.meta}>Approved columns only · consent-aware contacts · no GIA dialogue or access codes</span>
      </div>

      {data?.role === 'admin' && (
        <section className={styles.intake}>
          <h2>Manual intake</h2>
          <p className={styles.meta}>Consent is never inferred and is not required to capture. Leave the box unchecked unless the person gave informed consent in this conversation. Consent unknown means they cannot be messaged.</p>
          <form className={styles.filters} onSubmit={intake}>
            <label className={styles.field}>Name
              <input name="iname" required maxLength={120} />
            </label>
            <label className={styles.field}>Email
              <input name="iemail" type="email" maxLength={120} />
            </label>
            <label className={styles.field}>Phone
              <input name="iphone" maxLength={20} />
            </label>
            <label className={styles.field}>Campaign
              <input name="icampaign" maxLength={80} />
            </label>
            <label className={styles.field}>Source
              <select name="isource" defaultValue="manual">
                <option value="manual">manual</option>
                <option value="versa">versa</option>
                <option value="messenger">messenger</option>
              </select>
            </label>
            <label className={styles.field}>Versa lead ref
              <input name="ivlr" maxLength={80} />
            </label>
            <label className={styles.field}>Program interest
              <input name="iinterest" maxLength={80} />
            </label>
            <label className={styles.field}>Consent notice version
              <input name="inotice" maxLength={80} placeholder="only if consent is given" />
            </label>
            {COMM_CHANNELS.map((channel) => (
              <label className={styles.check} key={channel}>
                <input type="checkbox" name={`ipref_${channel}`} />
                Allow {channel}
              </label>
            ))}
            <label className={styles.check}>
              <input type="checkbox" name="iconsent" />
              Explicit consent given (do not tick from a CSV)
            </label>
            <button disabled={busy}>Save manual lead</button>
          </form>

          <h2>CSV import</h2>
          <p className={styles.meta}>Dry run first. Auto-merge only on a verified email/mobile or the same versa_lead_ref. Unverified matches are flagged. Re-importing the same file has no effect. Access-code columns are rejected.</p>
          <form className={styles.filters} onSubmit={(e) => e.preventDefault()}>
            <label className={styles.field}>Synthetic CSV
              <input type="file" name="csvfile" accept=".csv,text/csv" />
            </label>
            <button type="button" disabled={busy} onClick={(e) => {
              const input = (e.currentTarget.form?.elements.namedItem('csvfile') as HTMLInputElement | null);
              const file = input?.files?.[0];
              if (file) importCsv(file, true);
            }}>Dry run</button>
            <button type="button" disabled={busy} onClick={(e) => {
              const input = (e.currentTarget.form?.elements.namedItem('csvfile') as HTMLInputElement | null);
              const file = input?.files?.[0];
              if (file) importCsv(file, false);
            }}>Import CSV</button>
          </form>
          {importReport && (
            <div>
              <p className={styles.meta}>
                Batch {importReport.batchId} · accepted {importReport.accepted} · merged {importReport.merged} · flagged {importReport.flagged} · rejected {importReport.rejected}
                {importReport.idempotent ? ' · repeat import (no changes)' : ''}
                {importReport.dryRun ? ' · dry run' : ''}
              </p>
              <ol className={styles.history}>
                {importReport.lines.map((line) => (
                  <li key={line.line}>Line {line.line} · {line.status}{line.reason ? ` · ${line.reason}` : ''}</li>
                ))}
              </ol>
            </div>
          )}

          <h2>Possible duplicates</h2>
          {(data.duplicates || []).length === 0 && <p className={styles.meta}>No unverified identity collisions awaiting review.</p>}
          {(data.duplicates || []).map((dup) => (
            <div className={styles.card} key={dup.id}>
              <p><strong>{dup.leftName}</strong> / <strong>{dup.rightName}</strong></p>
              <p className={styles.meta}>
                {dup.possible || dup.matchOn === 'name'
                  ? 'Possible name match (email or phone differs). This is not a duplicate identity.'
                  : `Possible duplicate on ${dup.matchOn}. Auto-merge is blocked until a contact is verified.`}
              </p>
              <div className={styles.actions}>
                <button type="button" onClick={() => setSelected(dup.leftId)}>{dup.leftName}</button>
                <button type="button" onClick={() => setSelected(dup.rightId)}>{dup.rightName}</button>
                <button type="button" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const { ok } = await postJson('/api/recruitment/command/duplicates', { id: dup.id, action: 'keep' });
                    setMessage(ok ? 'Duplicate dismissed' : 'Update failed');
                    if (ok) await load({ keepMessage: true });
                  } finally {
                    setBusy(false);
                  }
                }}>Keep both</button>
                <button type="button" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const { ok } = await postJson('/api/recruitment/command/duplicates', { id: dup.id, action: 'link' });
                    setMessage(ok ? 'Records linked' : 'Update failed');
                    if (ok) await load({ keepMessage: true });
                  } finally {
                    setBusy(false);
                  }
                }}>Link records</button>
                <button type="button" disabled={busy} onClick={async () => {
                  setBusy(true);
                  try {
                    const { ok, d } = await postJson('/api/recruitment/command/duplicates', { id: dup.id, action: 'merge', keeperId: dup.leftId });
                    setMessage(ok ? 'Records merged' : d.error === 'unverified' ? 'Merge blocked until a contact is verified' : 'Update failed');
                    if (ok) await load({ keepMessage: true });
                  } finally {
                    setBusy(false);
                  }
                }}>Merge into first</button>
              </div>
            </div>
          ))}
        </section>
      )}

      <h2>Handoff queue</h2>
      <div className={styles.handoffs}>
        {(data?.handoffs || []).length === 0 && <p className={styles.meta}>No open handoffs.</p>}
        {(data?.handoffs || []).map((h) => (
          <button type="button" className={styles.handoff} key={h.id} onClick={() => h.candidate_id && setSelected(h.candidate_id)}>
            <strong>{h.name}</strong>
            <p className={styles.meta}>{h.reason} · {h.state} · consent={h.consented ? 'true' : 'false'}{h.program ? ` · ${h.program}` : ''} · due {formatManilaStamp(h.due_at)}</p>
            {h.visitor_identity && <p className={styles.meta}>Visitor {h.visitor_identity} · {formatManilaStamp(h.created_at)}</p>}
            <div className={styles.row}>
              {h.unassigned && <span className={`${styles.badge} ${styles.warn}`}>Unassigned</span>}
              {h.escalated && <span className={`${styles.badge} ${styles.alert}`}>Escalate 18h</span>}
              {h.overdue && <span className={`${styles.badge} ${styles.warn}`}>Overdue 24h</span>}
            </div>
          </button>
        ))}
      </div>

      <div className={styles.split}>
        <section>
          <h2>Candidate queue</h2>
          <p className={styles.meta}>Names only in this list. Contact details open in the record.</p>
          <div className={styles.list}>
            {(data?.candidates || []).length === 0 && <p>No accessible candidates.</p>}
            {(data?.candidates || []).map((c) => (
              <article className={styles.card} key={c.id}>
                <h2>
                  <button type="button" onClick={() => setSelected(c.id)} aria-pressed={selected === c.id}>{c.name}</button>
                </h2>
                <p className={styles.meta}>{c.stage} · {c.assigned_leader || 'Unassigned'} · {c.source || 'no source'}</p>
                <p className={styles.meta}>{c.next_action || 'No next action'}{c.due_at ? ` · due ${formatManilaStamp(c.due_at)}` : ''}</p>
                <p className={styles.meta}>
                  {c.evaluation_next_step ? `Suggested ${c.evaluation_next_step}` : 'Not evaluated'}
                  {c.last_engaged_at ? ` · last engaged ${formatManilaStamp(c.last_engaged_at)}` : ''}
                  {c.last_engagement_outcome ? ` · ${c.last_engagement_outcome}` : ''}
                </p>
                <div className={styles.row}>
                  {c.literacy_status !== 'not_started' && <span className={styles.badge}>Literacy {c.literacy_status}</span>}
                  {c.spike_paid && <span className={styles.badge}>SPIKE paid</span>}
                  {c.evaluation_next_step && <span className={styles.badge}>Eval {c.evaluation_next_step}</span>}
                  {c.escalated && <span className={`${styles.badge} ${styles.alert}`}>Escalate 18h</span>}
                  {c.overdue && <span className={`${styles.badge} ${styles.warn}`}>Overdue follow-up</span>}
                  {c.stage === STOP_STAGE && <span className={`${styles.badge} ${styles.alert}`}>STOP</span>}
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.detail}>
          {!row && <p className={styles.meta}>Select a candidate to see history and follow-up.</p>}
          {row && (
            <div>
              <h2>{row.name}</h2>
              <p className={styles.meta}>Stage {row.stage} · Literacy {row.literacy_status} · SPIKE paid {row.spike_paid ? 'yes' : 'no'}</p>
              <p className={styles.meta}>Contact (authorized record) · {row.email || 'no email'} · {row.phone || 'no phone'} · consent {row.consent_status || 'unknown'}</p>
              {row.consent_status !== 'granted' && (
                <p className={styles.meta}>Cannot be messaged — consent {row.consent_status || 'unknown'}.</p>
              )}
              <p className={styles.meta}>Campaign {row.campaign || 'none'} · channel {row.capture_channel || 'none'} · registered {row.registered_at ? formatManilaStamp(row.registered_at) : 'n/a'}</p>
              <p className={styles.meta}>Versa lead {row.versa_lead_ref || 'none'} · SPIKE learner {row.spike_learner_ref || 'none'} · interest {row.program_interest || 'none'}</p>
              <p className={styles.meta}>
                Last engaged {row.last_engaged_at ? formatManilaStamp(row.last_engaged_at) : 'never'}
                {row.last_engagement_outcome ? ` · ${row.last_engagement_outcome}` : ''}
                {row.evaluated_at ? ` · evaluated ${formatManilaStamp(row.evaluated_at)} by ${row.evaluated_by || 'staff'}` : ' · not evaluated'}
              </p>
              <form onSubmit={(e) => evaluate(e, row)}>
                <h2>Preliminary evaluation</h2>
                <p className={styles.meta}>{data?.evaluationConfig?.title || 'Evaluation'}. Does not change stage or grant L1/L2 access. No scoring.</p>
                <input type="hidden" name="configId" value={data?.evaluationConfig?.id || ''} />
                <input type="hidden" name="configVersion" value={data?.evaluationConfig?.version || ''} />
                {(data?.evaluationConfig?.sections || []).map((section) => (
                  <fieldset key={section.id} className={styles.filters} disabled={stopped}>
                    <legend>{section.title}</legend>
                    {section.fields.map((field) => (
                      <label className={styles.field} key={field.id}>{field.label}
                        {field.type === 'select' ? (
                          <select name={field.id} required={field.required} defaultValue={field.id === 'recommended_next_action' ? (row.evaluation_next_step || '') : ''}>
                            <option value="">{field.required ? 'Select' : 'Optional'}</option>
                            {(field.options || []).map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                          </select>
                        ) : field.type === 'textarea' ? (
                          <textarea name={field.id} required={field.required} maxLength={field.maxLength || 1000} />
                        ) : (
                          <input name={field.id} required={field.required} maxLength={field.maxLength || 200} />
                        )}
                      </label>
                    ))}
                  </fieldset>
                ))}
                <div className={styles.actions}>
                  <button type="submit" disabled={busy || stopped}>Record evaluation</button>
                </div>
              </form>
              <form onSubmit={(e) => recordGiaEvent(e, row)}>
                <h2>GIA engagement event</h2>
                <p className={styles.meta}>Append-only timeline. GIA text is not a decision.</p>
                <label className={styles.field}>Kind
                  <select name="giaKind" defaultValue="gia.conversation" disabled={stopped}>
                    {GIA_ENGAGEMENT_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
                  </select>
                </label>
                <label className={styles.field}>Intent — no personal details
                  <input name="giaIntent" maxLength={80} defaultValue="synthetic" disabled={stopped} />
                </label>
                <label className={styles.field}>Citation
                  <input name="giaCitation" maxLength={80} disabled={stopped} />
                </label>
                <div className={styles.actions}>
                  <button type="submit" disabled={busy || stopped}>Record GIA event</button>
                </div>
              </form>
              {isAiaAdvisorPathway(row.program_interest) ? (
                <form onSubmit={(e) => recordAia(e, row)}>
                  <h2>Official AIA registration</h2>
                  <p className={styles.meta}>AIA advisor path only. Assigned recruiter/introducer must be selected and confirmed before any registration handoff. Candidate self-report can only create pending. Submitted and verified are staff actions. Does not grant Versa/SPIKE entitlements or paid L2. Official AIA iRecruit remains the system of record — {AIA_LEADER_TASK}. Do not send candidates a public form link from here.</p>
                  <p className={styles.meta}>Leader task: {AIA_LEADER_TASK}</p>
                  <p className={styles.meta}>Status {row.aia_registration_status || 'not started'} · recruiter {row.assigned_leader || 'missing'}{row.aia_attribution ? ` · referral ${row.aia_attribution.referralSource} · confirmed by ${row.aia_attribution.confirmedBy}` : ' · attribution not confirmed'}</p>
                  <label className={styles.field}>Referral source
                    <input name="referralSource" maxLength={120} defaultValue={row.aia_attribution?.referralSource || ''} disabled={stopped} />
                  </label>
                  <div className={styles.actions}>
                    <button type="submit" name="aiaAction" value="confirm_attribution" disabled={busy || stopped || !row.assigned_leader}>Confirm recruiter attribution</button>
                    <button type="submit" name="aiaAction" value="pending" disabled={busy || stopped || !row.aia_attribution}>Record candidate self-report (pending)</button>
                    <button type="submit" name="aiaAction" value="submitted" disabled={busy || stopped || !row.aia_attribution}>Mark submitted (staff)</button>
                    <button type="submit" name="aiaAction" value="verified" disabled={busy || stopped || !row.aia_attribution}>Mark verified (staff)</button>
                  </div>
                </form>
              ) : (
                <p className={styles.meta}>Official AIA registration does not apply ({row.program_interest || 'no program interest'} — intern and free-learner paths are excluded).</p>
              )}
            <form key={row.id + row.stage + (row.due_at || '')} onSubmit={(e) => update(e, row)}>
              {data?.role === 'admin' && !stopped && (
                <div className={styles.actions}>
                  {!row.email_verified && row.email && (
                    <button type="button" disabled={busy} onClick={async () => {
                      setBusy(true);
                      try {
                        const { ok } = await postJson('/api/recruitment/command/verify-contact', { id: row.id, channel: 'email' });
                        setMessage(ok ? 'Email marked verified' : 'Verification failed');
                        if (ok) await loadDetail(row.id);
                      } finally { setBusy(false); }
                    }}>Mark email verified</button>
                  )}
                  {!row.phone_verified && row.phone && (
                    <button type="button" disabled={busy} onClick={async () => {
                      setBusy(true);
                      try {
                        const { ok } = await postJson('/api/recruitment/command/verify-contact', { id: row.id, channel: 'phone' });
                        setMessage(ok ? 'Phone marked verified' : 'Verification failed');
                        if (ok) await loadDetail(row.id);
                      } finally { setBusy(false); }
                    }}>Mark phone verified</button>
                  )}
                </div>
              )}
              {row.escalate_at && row.handoff_state === 'open' && new Date(row.escalate_at) < new Date() && (
                <p className={styles.alert}>Escalate to Nilo — unclaimed after 18 hours.</p>
              )}
              {row.handoff_due && <p className={styles.meta}>Handoff due: {formatManilaStamp(row.handoff_due)}</p>}

              <label className={styles.field}>Stage
                <select name="stage" defaultValue={stopped ? STOP_STAGE : row.stage} disabled={stopped}>
                  {stopped && <option value={STOP_STAGE}>{STOP_STAGE}</option>}
                  {WRITABLE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className={styles.field}>Assigned leader email
                <input
                  name="leader"
                  defaultValue={row.assigned_leader || ''}
                  list="command-leaders"
                  readOnly={data?.role !== 'admin'}
                  disabled={stopped}
                />
              </label>
              <datalist id="command-leaders">
                {(data?.leaders || []).map((l) => <option key={l.email} value={l.email} />)}
              </datalist>
              <label className={styles.field}>Next action
                <input name="next" maxLength={500} defaultValue={row.next_action || ''} disabled={stopped} />
              </label>
              <label className={styles.field}>Follow-up outcome
                <select name="outcome" defaultValue={row.last_engagement_outcome || ''} disabled={stopped}>
                  <option value="">Not logged</option>
                  {ENGAGEMENT_OUTCOMES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <label className={styles.field}>Follow-up due (Asia/Manila)
                <input type="datetime-local" name="due" defaultValue={toManilaDateTimeLocal(row.due_at)} disabled={stopped} />
              </label>
              <label className={styles.field}>Literacy
                <select name="literacy" defaultValue={row.literacy_status} disabled={stopped}>
                  {LITERACY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              {data?.role === 'admin' && (
                <label className={styles.check}>
                  <input type="checkbox" name="paid" defaultChecked={row.spike_paid} disabled={stopped} />
                  SPIKE paid (manual entry)
                </label>
              )}
              <label className={styles.field}>Resolution
                <textarea name="resolution" maxLength={2000} defaultValue={row.resolution || ''} disabled={stopped} />
              </label>
              <label className={styles.check}>
                <input type="checkbox" name="learn" defaultChecked={!!row.gia_could_answer} disabled={stopped} />
                GIA could answer this in future
              </label>
              <label className={styles.field}>General answer — no personal details
                <textarea name="answer" maxLength={2000} defaultValue={row.general_answer || ''} disabled={stopped} />
              </label>
              <label className={styles.check}>
                <input type="checkbox" name="resolve" disabled={stopped} />
                Resolve handoff
              </label>
              <div className={styles.actions}>
                <button disabled={busy || stopped}>Save follow-up</button>
                {!stopped && !confirmStop && (
                  <button type="button" className={styles.danger} disabled={busy} onClick={() => setConfirmStop(true)}>STOP / suppress all channels</button>
                )}
              </div>
              {confirmStop && !stopped && (
                <p>
                  STOP cannot be undone by changing stage. Opt-out applies to every linked channel.
                  <button type="button" className={styles.danger} disabled={busy} onClick={() => applyStop(row.id)}>Confirm global STOP</button>
                </p>
              )}
              {stopped && <p className={styles.alert}>Global STOP is in effect. Ordinary stage updates are blocked.</p>}
            </form>

              <h2>History</h2>
              <ol className={styles.history}>
                {(detail?.events || []).map((event) => (
                  <li key={event.id}>
                    {formatManilaStamp(event.created_at)} · {event.kind} · {event.actor}
                    {event.metadata?.to ? ` → ${String(event.metadata.to)}` : ''}
                    {event.metadata?.suggestedNextStep ? ` · suggest ${String(event.metadata.suggestedNextStep)}` : ''}
                    {event.metadata?.outcome ? ` · ${String(event.metadata.outcome)}` : ''}
                    {event.metadata?.officialDecision === false ? ' · not a decision' : ''}
                    {event.metadata?.officialDecision === true ? ' · official decision' : ''}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
