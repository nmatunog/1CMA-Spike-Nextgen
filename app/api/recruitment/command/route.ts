import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
export const runtime = 'nodejs';
export async function GET() {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const rows = await sql()`SELECT c.id,c.name,c.email,c.stage,c.assigned_leader,c.next_action,c.due_at,h.id AS handoff_id,h.reason,h.state,h.due_at AS handoff_due,h.escalate_at,h.resolution,h.gia_could_answer,h.general_answer FROM candidates c LEFT JOIN candidate_handoffs h ON h.candidate_id=c.id WHERE (${actor.role}='admin' OR c.assigned_leader=${actor.email}) ORDER BY h.created_at DESC NULLS LAST LIMIT 200`;
    return NextResponse.json({ candidates: rows, role: actor.role }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'service_unavailable' }, { status: 503 }); }
}
export async function PATCH(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 6000) throw new Error('invalid');
    const b = JSON.parse(raw);
    if (!/^[a-f0-9-]{36}$/i.test(b.id || '')) throw new Error('invalid');
    const stages = ['new_lead','contacted','fep_booked','fep_attended','evaluating','irecruit_started','licensing','coded','activated','not_now','disqualified'];
    if (!stages.includes(b.stage) || typeof b.nextAction !== 'string' || b.nextAction.length > 500 || typeof b.resolution !== 'string' || b.resolution.length > 2000 || typeof b.generalAnswer !== 'string' || b.generalAnswer.length > 2000) throw new Error('invalid');
    if (b.assignedLeader && !['leader','admin'].includes(JSON.parse(process.env.RECRUITMENT_STAFF_ROLES || '{}')[b.assignedLeader])) throw new Error('invalid');
    if (b.dueAt && !Number.isFinite(Date.parse(b.dueAt))) throw new Error('invalid');
    await sql().begin(async t => {
      const [c] = await t`SELECT * FROM candidates WHERE id=${b.id} AND (${actor.role}='admin' OR assigned_leader=${actor.email}) FOR UPDATE`;
      if (!c || c.stage === 'opt_out') throw new Error('forbidden');
      if (actor.role !== 'admin' && b.assignedLeader !== c.assigned_leader) throw new Error('forbidden');
      await t`UPDATE candidates SET stage=${b.stage},assigned_leader=${b.assignedLeader || null},next_action=${b.nextAction},due_at=${b.dueAt || null} WHERE id=${b.id}`;
      if (b.handoffId) {
        await t`UPDATE candidate_handoffs SET state=${b.resolve ? 'resolved' : 'acknowledged'},resolution=${b.resolution},gia_could_answer=${b.giaCouldAnswer === true},general_answer=${b.generalAnswer} WHERE id=${b.handoffId} AND candidate_id=${b.id}`;
      }
      await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES(${b.id},'followup.updated',${actor.email},${t.json({ stage: b.stage, handoffId: b.handoffId || null, resolved: !!b.resolve })})`;
    });
    return NextResponse.json({ ok: true });
  } catch (e) { return NextResponse.json({ error: e instanceof Error && e.message === 'forbidden' ? 'forbidden' : 'update_failed' }, { status: 400 }); }
}
