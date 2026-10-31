import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('assets/manifest.json', root), 'utf8'));
test('all supplied originals and archived v4 baseline match handoff checksums', () => {
  for (const [path, checksum] of Object.entries(manifest.sha256)) {
    assert.equal(createHash('sha256').update(readFileSync(new URL(path, root))).digest('hex'), checksum, path);
  }
});
test('runtime HTML has local modules/artwork, no remote runtime or invented logos', () => {
  const html = readFileSync(new URL('index.html', root), 'utf8');
  assert.ok(html.includes('Build Your Enterprise.'));
  assert.ok(html.includes('<h3>Level Up</h3>'));
  assert.ok(html.includes('Licensing is a required gate before regulated advisory work.'));
  assert.ok(html.includes('RA-SPIKE Rookie Academy'));
  assert.equal(/(?:src|href)=["'](?:https?:)?\/\//i.test(html), false);
  assert.equal(/<svg/i.test(html), false);
  for (const file of ['SPIKE_logo_dark_variant.png', '1CMA_logo.png', 'Versa_logo.png']) assert.ok(html.includes(file));
});
