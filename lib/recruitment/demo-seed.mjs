export { applyAllMigrations, listMigrationFiles } from '../gia/apply-migrations.mjs';

/** Always in the future so list_fep_sessions / book_fep can run on any date. */
export function futureFepInsertSql() {
  return "INSERT INTO fep_sessions(starts_at,capacity) VALUES(now() + interval '7 days',5)";
}

export async function seedFutureFep(exec) {
  await exec(futureFepInsertSql());
}

export async function seedSyntheticQueue(query, leaderEmail) {
  const overdue = '22222222-2222-4222-8222-222222222222';
  const unassigned = '11111111-1111-4111-8111-111111111111';
  const escalated = '33333333-3333-4333-8333-333333333333';
  await query(
    `INSERT INTO candidates(id,name,email,phone,score,stage,assigned_leader,next_action,due_at,literacy_status,spike_paid)
     VALUES
     ($1,'Synthetic Unassigned Alpha','alpha@example.test','',0,'new_lead',NULL,NULL,NULL,'not_started',false),
     ($2,'Synthetic Overdue Beta','beta@example.test','',0,'contacted',$4,'Call after FEP',now() - interval '2 hours','enrolled',false),
     ($3,'Synthetic Escalated Gamma','gamma@example.test','',0,'fep_booked',$4,'Confirm attendance',now() + interval '1 day','engaged',false)`,
    [unassigned, overdue, escalated, leaderEmail],
  );
  await query(
    `INSERT INTO candidate_identities(source,external_id,candidate_id) VALUES
     ('gia_web_session','synth-unassigned',$1),
     ('gia_web_session','synth-overdue',$2),
     ('gia_web_session','synth-escalated',$3)`,
    [unassigned, overdue, escalated],
  );
  await query(
    `INSERT INTO candidate_events(candidate_id,kind,actor,metadata) VALUES
     ($1,'candidate.created','seed','{}'),
     ($2,'candidate.created','seed','{}'),
     ($2,'stage.changed','seed','{"from":"new_lead","to":"contacted"}'),
     ($3,'candidate.created','seed','{}'),
     ($3,'fep.booked','seed','{"via":"seed"}')`,
    [unassigned, overdue, escalated],
  );
  await query(
    `INSERT INTO candidate_handoffs(candidate_id,reason,state,due_at,escalate_at,created_at)
     VALUES ($1,'leader_requested','open', now() - interval '2 hours', now() - interval '8 hours', now() - interval '26 hours')`,
    [escalated],
  );
}
