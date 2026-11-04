'use client';
import { useEffect, useState } from 'react';
export default function Command() {
  const [rows, setRows] = useState<any[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const r = await fetch('/api/recruitment/command', { cache: 'no-store' });
    const d = await r.json();
    if (!r.ok) setMessage(d.error); else setRows(d.candidates);
  }
  useEffect(() => { load().catch(() => setMessage('Service unavailable')); }, []);
  async function update(e: React.FormEvent<HTMLFormElement>, row: any) {
    e.preventDefault(); setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      const r = await fetch('/api/recruitment/command', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, handoffId: row.handoff_id, stage: f.get('stage'), assignedLeader: f.get('leader'), nextAction: f.get('next'), dueAt: f.get('due') ? new Date(String(f.get('due'))).toISOString() : null, resolution: f.get('resolution') || '', giaCouldAnswer: f.get('learn') === 'on', generalAnswer: f.get('answer') || '', resolve: f.get('resolve') === 'on' }) });
      setMessage(r.ok ? 'Follow-up saved' : 'Update failed'); if (r.ok) await load();
    } catch { setMessage('Service unavailable'); } finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 960, margin: 'auto', padding: 20 }}><h1>Recruitment Command Center</h1><p>Synthetic pilot · Shared candidate and GIA handoff queue</p><p role='status'>{message}</p><button onClick={() => load()}>Refresh</button>{rows.length === 0 && <p>No accessible candidates.</p>}{rows.map((r, i) => <form key={r.handoff_id || `${r.id}-${i}`} onSubmit={e => update(e, r)} style={{ display: 'grid', gap: 12, padding: 20, marginTop: 16, border: '1px solid #64748b', borderRadius: 12 }}><h2>{r.name}</h2><p>{r.email} · {r.reason || 'No handoff'} · {r.state}</p>{r.escalate_at && <p>{new Date(r.escalate_at) < new Date() && r.state === 'open' ? 'Escalate to Nilo — unclaimed after 18 hours. ' : ''}Due: {new Date(r.handoff_due).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })} Manila</p>}<label>Stage <select name='stage' defaultValue={r.stage}>{['new_lead','contacted','fep_booked','fep_attended','evaluating','irecruit_started','licensing','coded','activated','not_now','opt_out','disqualified'].map(s => <option key={s}>{s}</option>)}</select></label><label>Assigned leader email <input name='leader' defaultValue={r.assigned_leader || ''}/></label><label>Next action <input name='next' maxLength={500} defaultValue={r.next_action || ''}/></label><label>Follow-up due (your local time) <input type='datetime-local' name='due'/></label><label>Resolution <textarea name='resolution' maxLength={2000} defaultValue={r.resolution || ''}/></label><label><input type='checkbox' name='learn' defaultChecked={r.gia_could_answer}/> GIA could answer this in future</label><label>General answer — no personal details <textarea name='answer' maxLength={2000} defaultValue={r.general_answer || ''}/></label><label><input type='checkbox' name='resolve'/> Resolve handoff</label><button disabled={busy || r.stage === 'opt_out'}>Save follow-up</button></form>)}</main>;
}
