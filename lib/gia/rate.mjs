// Local rate windows for GIA. No paid limiter, no raw IPs stored.
import { createHmac } from 'node:crypto';
import { sql } from './repository';

function envInt(name, fallback) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export function rateLimitsFromEnv() {
  return {
    ipMax: envInt('GIA_RATE_LIMIT_IP_MAX', 60),
    ipWindowMs: envInt('GIA_RATE_LIMIT_IP_WINDOW_MS', 60_000),
    globalMax: envInt('GIA_RATE_LIMIT_GLOBAL_MAX', 300),
    globalWindowMs: envInt('GIA_RATE_LIMIT_GLOBAL_WINDOW_MS', 60_000),
    urgentIpMax: envInt('GIA_URGENT_UNCONSENTED_IP_MAX', 3),
    urgentWindowMs: envInt('GIA_URGENT_UNCONSENTED_WINDOW_MS', 3_600_000),
  };
}

function expandIpv6(ip) {
  const [head, tail] = String(ip).split('::');
  const left = head ? head.split(':').filter(Boolean) : [];
  const right = tail ? tail.split(':').filter(Boolean) : [];
  const missing = Math.max(0, 8 - left.length - right.length);
  return [...left, ...Array(missing).fill('0'), ...right].map(p => p || '0');
}

/** IPv4 stays whole. IPv6 is masked to /64. Never returns a raw address to callers who hash it. */
export function normalizeClientIp(raw) {
  const first = String(raw || '').split(',')[0].trim().replace(/^\[|\]$/g, '');
  if (!first) return 'unknown';
  const mapped = first.match(/:ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (mapped) return mapped[1];
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(first)) return first;
  if (first.includes(':')) {
    const parts = expandIpv6(first.toLowerCase());
    return `${parts.slice(0, 4).map(p => p.padStart(4, '0')).join(':')}::`;
  }
  return 'unknown';
}

function header(req, name) {
  if (!req || !req.headers) return '';
  if (typeof req.headers.get === 'function') return req.headers.get(name) || '';
  const direct = req.headers[name] || req.headers[name.toLowerCase()];
  return Array.isArray(direct) ? direct[0] || '' : direct || '';
}

function trustedProxyMode() {
  const named = String(process.env.GIA_TRUSTED_PROXY || '').trim().toLowerCase();
  if (named === 'cloudflare' || process.env.GIA_TRUST_CF_CONNECTING_IP === 'true') return 'cloudflare';
  if (named === 'forwarded' || process.env.GIA_TRUST_FORWARDED_FOR === 'true') return 'forwarded';
  return 'none';
}

function socketRemoteAddress(req) {
  const socket = req && (req.socket || req.connection);
  if (socket && socket.remoteAddress) return normalizeClientIp(socket.remoteAddress);
  return 'direct';
}

/** Client IP for rate keys. Spoofable XFF/X-Real-IP are ignored unless GIA_TRUSTED_PROXY is set. */
export function clientIpFromRequest(req) {
  const mode = trustedProxyMode();
  if (mode === 'cloudflare') return normalizeClientIp(header(req, 'cf-connecting-ip'));
  if (mode === 'forwarded') return normalizeClientIp(header(req, 'x-forwarded-for') || header(req, 'x-real-ip'));
  return socketRemoteAddress(req);
}

export function hashRateKey(value, secret) {
  const s = secret || process.env.GIA_SESSION_SECRET || '';
  if (!s || s.length < 32) return createHmac('sha256', 'gia-rate-fallback-not-for-production').update(String(value)).digest('hex');
  return createHmac('sha256', s).update(`gia-rate:${value}`).digest('hex');
}

export function windowStart(now, windowMs) {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

export function rateWindowTtlMs() {
  return envInt('GIA_RATE_WINDOW_TTL_MS', 2 * 60 * 60 * 1000);
}

export async function pruneExpiredRateWindows(now = Date.now(), ttlMs = rateWindowTtlMs()) {
  const cutoff = new Date(now - ttlMs).toISOString();
  await sql()`DELETE FROM gia_rate_windows WHERE window_start < ${cutoff}`;
}

export async function bumpRateWindow(bucket, windowMs, now = Date.now()) {
  await pruneExpiredRateWindows(now);
  const start = windowStart(now, windowMs).toISOString();
  const rows = await sql()`INSERT INTO gia_rate_windows(bucket, window_start, hits) VALUES(${bucket}, ${start}, 1) ON CONFLICT (bucket, window_start) DO UPDATE SET hits = gia_rate_windows.hits + 1 RETURNING hits`;
  return Number(rows[0]?.hits || 0);
}

export async function checkRequestRate(ipKey, limits, now = Date.now()) {
  const ipHits = await bumpRateWindow(`ip:${ipKey}`, limits.ipWindowMs, now);
  const globalHits = await bumpRateWindow('global', limits.globalWindowMs, now);
  return {
    limited: ipHits > limits.ipMax || globalHits > limits.globalMax,
    ipHits,
    globalHits,
  };
}

export async function checkUnconsentedUrgentCap(ipKey, limits, now = Date.now()) {
  const hits = await bumpRateWindow(`urgent:${ipKey}`, limits.urgentWindowMs, now);
  return { limited: hits > limits.urgentIpMax, hits };
}

export function logSafetyHandoffFailed(err) {
  const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'unknown';
  const name = err instanceof Error ? err.name : 'Error';
  console.error(JSON.stringify({ event: 'gia_safety_handoff_failed', code, name }));
}
