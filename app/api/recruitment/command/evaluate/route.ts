import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { parseEvaluationBody, recordEvaluation } from '@/lib/recruitment/store';
import { submitEvaluation } from '@/lib/mvp01/evaluate';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 16000) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    if (body.answers && typeof body.answers === 'object' && !Array.isArray(body.answers)) {
      const answers: Record<string, string> = {};
      for (const [key, value] of Object.entries(body.answers as Record<string, unknown>)) {
        answers[key] = typeof value === 'string' ? value : '';
      }
      await submitEvaluation(sql(), actor, {
        candidateId: String(body.id || body.candidateId || ''),
        configId: String(body.configId || ''),
        configVersion: Number(body.configVersion),
        answers,
      });
    } else {
      await recordEvaluation(sql(), actor, parseEvaluationBody(body));
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'forbidden' || message === 'suppressed') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
}
