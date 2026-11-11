import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { getCandidate } from '@/lib/recruitment/store';

export const runtime = 'nodejs';

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const { id } = await ctx.params;
    const detail = await getCandidate(sql(), actor, id);
    if (!detail) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    return NextResponse.json(detail, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const message = e instanceof Error ? e.message : '';
    if (message === 'forbidden') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
