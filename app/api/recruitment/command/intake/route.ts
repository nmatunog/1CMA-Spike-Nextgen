import { NextResponse } from 'next/server';
import { staff } from '@/lib/gia/staff';
import { sql } from '@/lib/gia/repository';
import { sameOrigin } from '@/lib/gia/origin';
import { createManualLead, intakeErrorCode } from '@/lib/recruitment/import';
import { COMM_CHANNELS, type CommChannel } from '@/lib/mvp01/interfaces';

export const runtime = 'nodejs';

function parseChannelPrefs(raw: unknown): Partial<Record<CommChannel, boolean>> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const prefs: Partial<Record<CommChannel, boolean>> = {};
  const record = raw as Record<string, unknown>;
  for (const channel of COMM_CHANNELS) {
    if (record[channel] === true) prefs[channel] = true;
  }
  return prefs;
}

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
      campaign: typeof body.campaign === 'string' ? body.campaign : '',
      consentGranted: body.consentGranted === true,
      noticeVersion: typeof body.noticeVersion === 'string' ? body.noticeVersion : '',
      channelPrefs: parseChannelPrefs(body.channelPrefs),
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const code = intakeErrorCode(error);
    if (code === 'forbidden') return NextResponse.json({ error: code }, { status: 403 });
    return NextResponse.json({ error: code }, { status: 400 });
  }
}
