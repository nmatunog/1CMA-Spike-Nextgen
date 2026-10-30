import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8');
const luminance = hex => {
  const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
  return rgb.reduce((sum, value, i) => sum + value * [.2126, .7152, .0722][i], 0);
};
const ratio = (a, b) => { const [lo, hi] = [luminance(a), luminance(b)].sort((a, b) => a - b); return (hi + .05) / (lo + .05); };
for (const [theme, selector] of [['dark', ':root{'], ['light', ':root[data-theme=light]{']]) {
  test(`${theme}: solid surface text and control boundaries meet contrast thresholds`, () => {
    const block = css.slice(css.indexOf(selector)).split('}')[0];
    const tokens = Object.fromEntries([...block.matchAll(/--([\w-]+):(#[0-9a-f]{6})/g)].map(m => [m[1], m[2]]));
    for (const background of ['bg', 'surface', 'surface2']) {
      for (const foreground of ['text', 'muted', 'accent', 'error']) assert.ok(ratio(tokens[foreground], tokens[background]) >= 4.5, `${foreground} on ${background}`);
      assert.ok(ratio(tokens.line, tokens[background]) >= 3, `control boundary on ${background}`);
    }
    assert.ok(ratio(tokens['accent-text'], tokens.accent) >= 4.5, 'primary button text');
  });
}
