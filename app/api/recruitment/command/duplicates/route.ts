import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { dismissDuplicate } from '@/lib/recruitment/import';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const body = await req.json() as { id?: string };
    await dismissDuplicate(sql(), actor, String(body.id || ''));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'update_failed' }, { status: 400 });
  }
}
