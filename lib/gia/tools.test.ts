import { describe, it, expect } from 'vitest';
import { GIA_TOOLS, WORKFLOW_ACTIONS } from './workflow.mjs';

describe('GIA tool allowlist', () => {
  it('is exactly list_fep_sessions, book_fep, request_leader, get_my_status, opt_out', () => {
    expect(GIA_TOOLS).toEqual(['list_fep_sessions', 'book_fep', 'request_leader', 'get_my_status', 'opt_out']);
    expect(WORKFLOW_ACTIONS).toContain('consent');
    expect(WORKFLOW_ACTIONS).not.toContain('cancel_fep');
  });
});
