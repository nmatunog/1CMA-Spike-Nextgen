const REDACT_KEYS = new Set([
  'code',
  'versaCode',
  'accessCode',
  'access_code',
  'rawCode',
  'raw_code',
  'plaintext',
  'csv',
  'csvText',
  'password',
  'secret',
  'hmac',
  'digest',
  'code_digest',
  'codeDigest',
  'email',
  'verified_email',
  'userId',
]);

/** @param {unknown} value */
function redactValue(value, key) {
  if (key && REDACT_KEYS.has(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map((item) => redactValue(item, key));
  if (value && typeof value === 'object') {
    /** @type {Record<string, unknown>} */
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = redactValue(v, k);
    }
    return out;
  }
  return value;
}

/**
 * Structured audit log without raw codes, digests, or CSV bodies.
 * @param {{ info?: Function, warn?: Function, error?: Function }} [sink]
 */
export function createVersaLogger(sink = console) {
  const write = (level, event) => {
    const payload = {
      scope: 'versa-code',
      ts: new Date().toISOString(),
      .../** @type {Record<string, unknown>} */ (redactValue(event, '')),
    };
    const fn = sink?.[level] || sink?.info || console.info;
    fn.call(sink, JSON.stringify(payload));
  };

  return {
    info: (event) => write('info', event),
    warn: (event) => write('warn', event),
    error: (event) => write('error', event),
  };
}
