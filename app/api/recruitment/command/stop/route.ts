import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { stopCandidate } from '@/lib/recruitment/store';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 600) throw new Error('invalid');
    const body = JSON.parse(raw) as { id?: string };
    await stopCandidate(sql(), actor, String(body.id || ''));
    return NextResponse.json({ ok: true, stopped: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message === 'forbidden' || message === 'suppressed') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    return NextResponse.json({ error: 'update_failed' }, { status: 400 });
  }
}
