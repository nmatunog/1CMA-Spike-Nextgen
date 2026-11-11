import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import {
  dashboardCounts,
  listCandidates,
  listHandoffs,
  listSources,
  parseFollowUpBody,
  saveFollowUp,
  staffDirectory,
} from '@/lib/recruitment/store';
import { manilaDaysAgo, manilaToday, MANILA_TIME_ZONE } from '@/lib/recruitment/time';

export const runtime = 'nodejs';

function fail(error: unknown) {
  const message = error instanceof Error ? error.message : '';
  if (message === 'forbidden' || message === 'suppressed') {
    return NextResponse.json({ error: message }, { status: 403 });
  }
  return NextResponse.json({ error: 'update_failed' }, { status: 400 });
}

export async function GET(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const url = new URL(req.url);
    const filters = {
      from: url.searchParams.get('from') || manilaDaysAgo(30),
      to: url.searchParams.get('to') || manilaToday(),
      source: url.searchParams.get('source') || '',
      leader: url.searchParams.get('leader') || '',
      q: url.searchParams.get('q') || '',
      stage: url.searchParams.get('stage') || '',
    };
    const db = sql();
    const dashboard = await dashboardCounts(db, actor, filters);
    const candidates = await listCandidates(db, actor, filters);
    const handoffs = await listHandoffs(db, actor, filters);
    const sources = await listSources(db);
    return NextResponse.json({
      role: actor.role,
      timezone: MANILA_TIME_ZONE,
      filters,
      dashboard,
      candidates,
      handoffs,
      sources,
      leaders: actor.role === 'admin' ? staffDirectory() : [],
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    const detail = e instanceof Error ? e.message : 'unknown';
    if (detail && !/email|phone|@/.test(detail)) console.error('command GET failed', detail);
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}

export async function PATCH(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 6000) throw new Error('invalid');
    const body = JSON.parse(raw) as Record<string, unknown>;
    await saveFollowUp(sql(), actor, parseFollowUpBody(body));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return fail(e);
  }
}
