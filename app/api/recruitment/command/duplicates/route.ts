import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { resolveDuplicate } from '@/lib/recruitment/import';
import { DUPLICATE_ACTIONS, type DuplicateAction } from '@/lib/mvp01/interfaces';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const body = await req.json() as { id?: string; action?: string; keeperId?: string };
    const action = (body.action || 'keep') as DuplicateAction;
    if (!(DUPLICATE_ACTIONS as readonly string[]).includes(action)) {
      return NextResponse.json({ error: 'invalid' }, { status: 400 });
    }
    await resolveDuplicate(sql(), actor, {
      flagId: String(body.id || ''),
      action,
      keeperId: typeof body.keeperId === 'string' ? body.keeperId : undefined,
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'forbidden' || message === 'suppressed') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (message === 'unverified') return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: 'update_failed' }, { status: 400 });
  }
}
