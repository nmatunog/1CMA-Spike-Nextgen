import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { ingestGiaEngagementEvent, isGiaEngagementKind } from '@/lib/mvp01/engage';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 4000) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const kind = body.kind;
    if (!isGiaEngagementKind(kind)) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
      ? body.metadata as Record<string, unknown>
      : {};
    await ingestGiaEngagementEvent(sql(), {
      candidateId: String(body.candidateId || ''),
      kind,
      actor: actor.email,
      metadata,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'suppressed') return NextResponse.json({ error: message }, { status: 403 });
    if (message === 'not_found') return NextResponse.json({ error: message }, { status: 404 });
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
}
