import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { loadActiveEvaluationConfig } from '@/lib/mvp01/evaluate';

export const runtime = 'nodejs';

export async function GET() {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const config = await loadActiveEvaluationConfig(sql());
    return NextResponse.json(config, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return NextResponse.json({ error: 'service_unavailable' }, { status: 503 });
  }
}
