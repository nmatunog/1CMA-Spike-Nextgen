import { describe, it, expect } from 'vitest';
import { normalizeClientIp, hashRateKey, windowStart, rateLimitsFromEnv } from './rate.mjs';

describe('GIA rate key normalization', () => {
  it('keeps IPv4 and masks IPv6 to /64', () => {
    expect(normalizeClientIp('203.0.113.10')).toBe('203.0.113.10');
    expect(normalizeClientIp('203.0.113.10, 10.0.0.1')).toBe('203.0.113.10');
    expect(normalizeClientIp('::ffff:192.0.2.10')).toBe('192.0.2.10');
    expect(normalizeClientIp('2001:db8:abcd:0012:1111:2222:3333:4444')).toBe('2001:0db8:abcd:0012::');
    expect(normalizeClientIp('2001:db8:abcd:0012:9999:8888:7777:6666')).toBe('2001:0db8:abcd:0012::');
    expect(normalizeClientIp('')).toBe('unknown');
  });
  it('hashes keys so raw IPs are not stored', () => {
    const hashed = hashRateKey('203.0.113.10', 's'.repeat(32));
    expect(hashed).toMatch(/^[a-f0-9]{64}$/);
    expect(hashed).not.toMatch(/203\.0\.113/);
  });
  it('reads positive env limits with defaults', () => {
    const prev = process.env.GIA_RATE_LIMIT_IP_MAX;
    process.env.GIA_RATE_LIMIT_IP_MAX = '12';
    expect(rateLimitsFromEnv().ipMax).toBe(12);
    process.env.GIA_RATE_LIMIT_IP_MAX = prev;
    expect(windowStart(65_000, 60_000).getTime()).toBe(60_000);
  });
});
