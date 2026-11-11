import { EVENT_KINDS, isEvaluationNextStep } from '@/lib/recruitment/stages';
import { assertWritable, identityIsSuppressed } from '@/lib/recruitment/suppression';
import type { Sql } from '@/lib/recruitment/store';
import type { StaffActor } from '@/lib/recruitment/types';
import { MVP01_EVALUATION_CONFIG, flattenEvaluationFields, type EvaluationFormConfig } from './evaluation-config';
import type { EvaluationSubmitInput } from './interfaces';

function asConfig(row: Record<string, unknown> | undefined): EvaluationFormConfig {
  if (!row) return MVP01_EVALUATION_CONFIG as unknown as EvaluationFormConfig;
  const sections = typeof row.sections === 'string' ? JSON.parse(row.sections) : row.sections;
  return {
    id: String(row.id),
    version: Number(row.version),
    title: String(row.title),
    sections: sections as EvaluationFormConfig['sections'],
  };
}

export async function loadActiveEvaluationConfig(sql: Sql): Promise<EvaluationFormConfig> {
  const [row] = await sql`SELECT id, version, title, sections FROM evaluation_form_configs WHERE active = true ORDER BY version DESC LIMIT 1`;
  return asConfig(row);
}

export function validateEvaluationAnswers(config: EvaluationFormConfig, answers: Record<string, string>) {
  const out: Record<string, string> = {};
  for (const field of flattenEvaluationFields(config)) {
    const raw = (answers[field.id] || '').trim();
    if (field.required && !raw) throw new Error('invalid');
    if (field.maxLength && raw.length > field.maxLength) throw new Error('invalid');
    if (field.type === 'select' && raw) {
      const allowed = (field.options || []).map((option) => option.value);
      if (!allowed.includes(raw)) throw new Error('invalid');
    }
    if (raw) out[field.id] = raw;
  }
  return out;
}

const NEXT_LABEL: Record<string, string> = {
  fep: 'Book / attend FEP',
  literacy: 'Financial Literacy follow-up',
  leader_conversation: 'Leader conversation',
  follow_up: 'Follow-up',
};

export async function submitEvaluation(sql: Sql, actor: StaffActor, input: EvaluationSubmitInput) {
  const config = await loadActiveEvaluationConfig(sql);
  if (input.configId !== config.id || Number(input.configVersion) !== Number(config.version)) throw new Error('invalid');
  const answers = validateEvaluationAnswers(config, input.answers || {});
  const outcome = answers.outcome;
  const recommended = answers.recommended_next_action;
  if (!outcome || !isEvaluationNextStep(recommended)) throw new Error('invalid');
  const nextAction = NEXT_LABEL[recommended] || recommended;
  return sql.begin(async (t: Sql) => {
    const [c] = await t`SELECT * FROM candidates WHERE id=${input.candidateId} AND (${actor.role}='admin' OR assigned_leader=${actor.email}) AND merged_into IS NULL FOR UPDATE`;
    if (!c) throw new Error('forbidden');
    assertWritable(c as { stage: string });
    if (await identityIsSuppressed(t, `candidate:${input.candidateId}`)) throw new Error('suppressed');
    const due = c.due_at || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await t`INSERT INTO candidate_evaluations(candidate_id,config_id,config_version,answers,outcome,recommended_next_action,evaluator)
      VALUES(${input.candidateId},${config.id},${config.version},${t.json ? t.json(answers) : JSON.stringify(answers)},${outcome},${recommended},${actor.email})`;
    await t`UPDATE candidates SET
      evaluation_next_step=${recommended},
      evaluated_at=now(),
      evaluated_by=${actor.email},
      next_action=${nextAction},
      due_at=${due},
      program_interest=COALESCE(NULLIF(${answers.program_interest || ''}, ''), program_interest)
      WHERE id=${input.candidateId}`;
    await t`INSERT INTO candidate_events(candidate_id,kind,actor,metadata)
      VALUES(${input.candidateId},${EVENT_KINDS.evaluationRecorded},${actor.email},${t.json ? t.json({
        suggestedNextStep: recommended,
        outcome,
        nextAction,
        officialDecision: true,
        human: true,
        configId: config.id,
        configVersion: config.version,
        stageUnchanged: String(c.stage),
      }) : JSON.stringify({ suggestedNextStep: recommended, outcome, nextAction, officialDecision: true, human: true })})`;
    return { ok: true as const, nextAction, outcome, recommendedNextStep: recommended };
  });
}
