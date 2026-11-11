import { describe, it, expect } from 'vitest';
import { discardedUploadResponse, looksLikeUploadPayload } from './uploads.mjs';

describe('chat upload discard', () => {
  it('treats multipart and file fields as uploads to discard', () => {
    expect(looksLikeUploadPayload(null, 'multipart/form-data; boundary=abc')).toBe(true);
    expect(looksLikeUploadPayload({ file: 'bytes' }, 'application/json')).toBe(true);
    expect(looksLikeUploadPayload({ document: { name: 'id.pdf' } }, 'application/json')).toBe(true);
    expect(looksLikeUploadPayload({ action: 'message', text: 'hello' }, 'application/json')).toBe(false);
  });
  it('returns the iRecruit/leader handoff and never keeps the payload', () => {
    const r = discardedUploadResponse();
    expect(r.discarded).toBe(true);
    expect(r.reason).toBe('documents');
    expect(r.text).toContain('iRecruit');
    expect(r.text).toContain('leader');
    expect(JSON.stringify(r)).not.toMatch(/bytes|id\.pdf/);
  });
});
