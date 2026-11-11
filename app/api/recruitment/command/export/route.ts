import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { exportCandidatesCsv } from '@/lib/recruitment/export';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 4000) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    const body = (raw ? JSON.parse(raw) : {}) as Record<string, unknown>;
    const result = await exportCandidatesCsv(sql(), actor, {
      source: typeof body.source === 'string' ? body.source : '',
      leader: typeof body.leader === 'string' ? body.leader : '',
      q: typeof body.q === 'string' ? body.q : '',
      stage: typeof body.stage === 'string' ? body.stage : '',
    });
    return new NextResponse(result.csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="command-export.csv"',
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'export_failed' }, { status: 400 });
  }
}
