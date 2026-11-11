import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { createManualLead } from '@/lib/recruitment/import';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (actor.role !== 'admin') return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 4000) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const result = await createManualLead(sql(), actor, {
      name: String(body.name || ''),
      email: typeof body.email === 'string' ? body.email : '',
      phone: typeof body.phone === 'string' ? body.phone : '',
      source: typeof body.source === 'string' ? body.source : 'manual',
      versaLeadRef: typeof body.versaLeadRef === 'string' ? body.versaLeadRef : '',
      programInterest: typeof body.programInterest === 'string' ? body.programInterest : '',
      consentGranted: body.consentGranted === true,
      noticeVersion: typeof body.noticeVersion === 'string' ? body.noticeVersion : '',
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'forbidden') return NextResponse.json({ error: message }, { status: 403 });
    return NextResponse.json({ error: message || 'invalid' }, { status: 400 });
  }
}
