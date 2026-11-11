import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { previewOrImportCsv } from '@/lib/recruitment/import';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 220_000) return NextResponse.json({ error: 'csv_too_large' }, { status: 400 });
    const body = JSON.parse(raw) as { csv?: string; filename?: string; dryRun?: boolean };
    if (typeof body.csv !== 'string') return NextResponse.json({ error: 'invalid' }, { status: 400 });
    const report = await previewOrImportCsv(sql(), actor, {
      csv: body.csv,
      filename: typeof body.filename === 'string' ? body.filename : 'upload.csv',
      dryRun: body.dryRun === true,
    });
    return NextResponse.json(report);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'forbidden') return NextResponse.json({ error: message }, { status: 403 });
    if ([
      'forbidden_secret_column',
      'unknown_column',
      'invalid_csv',
      'csv_too_large',
      'missing_name_column',
    ].includes(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    return NextResponse.json({ error: 'import_failed' }, { status: 400 });
  }
}
