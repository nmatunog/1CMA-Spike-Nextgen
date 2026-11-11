// Swappable program status source. Local/synthetic only in this increment.
// A later source must implement the same { id, lookup } shape. Never pass a
// portal hostname, paid API, or live learner/RA membership URL here.

const PORTAL = /portal\.1cma\.online|spike\.1cma|learner\.1cma|ra-spike\.1cma/i;

function assertLocalSource(id, payload) {
  const blob = `${id} ${JSON.stringify(payload || {})}`;
  if (PORTAL.test(blob) || /https?:\/\//i.test(blob)) {
    throw new Error('portal_hardwire_forbidden');
  }
}

export function createSyntheticProgramSource(seed = {}) {
  const records = new Map(Object.entries(seed));
  return {
    id: 'synthetic',
    async lookup({ program, identity }) {
      const row = records.get(`${program}:${identity}`) || null;
      const result = row
        ? { program, linked: true, stage: row.stage || null, cohort: row.cohort || null, source: 'synthetic' }
        : { program, linked: false, stage: null, cohort: null, source: 'synthetic' };
      assertLocalSource(this.id, result);
      return result;
    },
    seed(program, identity, row) {
      assertLocalSource('synthetic', row);
      records.set(`${program}:${identity}`, { ...row });
    },
    clear() {
      records.clear();
    },
  };
}

const defaultSource = createSyntheticProgramSource();

export function resetProgramSource() {
  defaultSource.clear();
}

export function programSource() {
  const requested = String(process.env.GIA_PROGRAM_SOURCE || 'synthetic').trim().toLowerCase();
  if (requested && requested !== 'synthetic') throw new Error('unsupported_program_source');
  return defaultSource;
}
