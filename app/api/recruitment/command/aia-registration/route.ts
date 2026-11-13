import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { applyAiaRegistration, parseAiaRegistrationBody } from '@/lib/mvp01/aia-registration';

export const runtime = 'nodejs';

const KNOWN = new Set([
  'forbidden',
  'suppressed',
  'attribution_missing',
  'attribution_stale',
  'not_aia_pathway',
  'fep_attendance_required',
  'invalid',
]);

export async function POST(req: Request) {
  const actor = await staff();
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!sameOrigin(req)) return NextResponse.json({ error: 'invalid_origin' }, { status: 403 });
  try {
    const raw = await req.text();
    if (raw.length > 4000) return NextResponse.json({ error: 'invalid' }, { status: 400 });
    const body = JSON.parse(raw) as Record<string, unknown>;
    const result = await applyAiaRegistration(sql(), actor, parseAiaRegistrationBody(body));
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message === 'forbidden' || message === 'suppressed' || message === 'consent_required') {
      return NextResponse.json({ error: message }, { status: 403 });
    }
    if (KNOWN.has(message)) return NextResponse.json({ error: message }, { status: 400 });
    return NextResponse.json({ error: 'invalid' }, { status: 400 });
  }
}
