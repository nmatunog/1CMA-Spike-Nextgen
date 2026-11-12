/** Asia/Manila calendar helpers. The Philippines does not observe DST (UTC+08:00). */
export const MANILA_TIME_ZONE = 'Asia/Manila';
export const MANILA_OFFSET = '+08:00';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_LOCAL = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

function manilaParts(iso: string | Date) {
  const d = iso instanceof Date ? iso : new Date(iso);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MANILA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
  };
}

/** Inclusive Manila calendar-day bounds as UTC instants. */
export function manilaDayBounds(fromDate: string, toDate: string) {
  if (!DATE.test(fromDate) || !DATE.test(toDate) || fromDate > toDate) return null;
  const from = new Date(`${fromDate}T00:00:00${MANILA_OFFSET}`);
  const end = new Date(`${toDate}T00:00:00${MANILA_OFFSET}`);
  end.setUTCDate(end.getUTCDate() + 1);
  return { from: from.toISOString(), toExclusive: end.toISOString() };
}

export function parseManilaDateTimeLocal(value: string | null | undefined) {
  if (!value) return null;
  if (!DATETIME_LOCAL.test(value)) return null;
  const parsed = new Date(`${value}:00${MANILA_OFFSET}`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

export function toManilaDateTimeLocal(iso: string | Date | null | undefined) {
  if (!iso) return '';
  const p = manilaParts(iso);
  if (!p.year) return '';
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

export function manilaToday() {
  const p = manilaParts(new Date());
  return `${p.year}-${p.month}-${p.day}`;
}

export function manilaDaysAgo(days: number) {
  const today = manilaToday();
  const start = new Date(`${today}T00:00:00${MANILA_OFFSET}`);
  start.setUTCDate(start.getUTCDate() - days);
  const p = manilaParts(start);
  return `${p.year}-${p.month}-${p.day}`;
}

export function formatManila(iso: string | Date | null | undefined) {
  if (!iso) return '';
  const d = iso instanceof Date ? iso : new Date(iso);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toLocaleString('en-PH', { timeZone: MANILA_TIME_ZONE });
}

export function formatManilaStamp(iso: string | Date | null | undefined) {
  if (!iso) return '';
  const p = manilaParts(iso);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute} PHT`;
}

export function hoursBetween(from: string | Date, to: Date = new Date()) {
  const start = from instanceof Date ? from : new Date(from);
  return (to.getTime() - start.getTime()) / 36e5;
}
