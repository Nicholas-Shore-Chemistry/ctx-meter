// tests/docs.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { globExpr } from '../plugins/ctx-meter/scripts/lib/command.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const read = (f) => readFileSync(path.join(root, f), 'utf8');

test('LICENSE is MIT and acknowledges claude-hud', () => {
  const lic = read('LICENSE');
  assert.match(lic, /MIT License/);
  assert.match(lic, /claude-hud/i);
});

test('README documents install, the two invocation names, and the no-advice contract', () => {
  const r = read('README.md');
  assert.match(r, /\/plugin install ctx-meter/);
  assert.match(r, /\/ctx-meter:setup/);
  assert.match(r, /no (advice|recommendations)/i);
});

test('CHANGELOG has an entry', () => {
  assert.match(read('CHANGELOG.md'), /0\.1\.0/);
});

test('README documents co-existence, teardown, and the native-PowerShell regression', () => {
  const r = read('README.md');
  assert.match(r, /co-?exist/i);
  assert.match(r, /\/ctx-meter:teardown/);
  assert.match(r, /Git Bash/i);
  // Preserve the substrings the earlier tests require: /plugin install, /ctx-meter:setup,
  // and the no-advice phrase are still asserted by the existing README test above.
});

test('CHANGELOG has a 0.3.0 entry noting co-exist + teardown + the PowerShell removal', () => {
  const c = read('CHANGELOG.md');
  assert.match(c, /0\.3\.0/);
  assert.match(c, /co-?exist|teardown/i);
  assert.match(c, /PowerShell/);
});

test('setup.md and teardown.md embed the exact version-resolution pipeline globExpr() emits', () => {
  // The pipeline is triplicated (command.mjs JS + these two markdown docs) with no shared
  // code path; only the assigned var name differs. Compare the `$(...)` body so a future
  // edit to the sort/glob in one place can't silently make /setup or /teardown resolve a
  // different installed version than the statusline launches (the I1 fix hit all three).
  const expr = globExpr();
  const body = expr.slice(expr.indexOf('$(')); // drop the `plugin_dir=` / `PLUGIN_DIR=` prefix
  for (const f of [
    'plugins/ctx-meter/commands/setup.md',
    'plugins/ctx-meter/commands/teardown.md',
  ]) {
    assert.ok(read(f).includes(body), `${f} must embed the current globExpr() pipeline verbatim`);
  }
});

test('LICENSE keeps Ovid and adds Nicholas Shore', () => {
  for (const f of ['LICENSE', 'plugins/ctx-meter/LICENSE']) {
    const lic = read(f);
    const ovid = lic.indexOf('Copyright (c) 2026 Ovid');
    const nick = lic.indexOf('Copyright (c) 2026 Nicholas Shore');
    assert.ok(ovid >= 0, f + ' keeps Ovid');
    assert.ok(nick > ovid, f + ' adds Nicholas Shore under Ovid');
    assert.match(lic, /claude-hud/i);
  }
});

test('README opens with the credit', () => {
  const lines = read('README.md').split(/\r?\n/);
  assert.equal(lines[0], '# ctx-meter');
  assert.equal(
    lines[2],
    'Created by Ovid ([Ovid/claude-context](https://github.com/Ovid/claude-context)), extended by Nicholas Shore.',
  );
});

test('README install uses Nicholas-Shore-Chemistry/ctx-meter', () => {
  const r = read('README.md');
  assert.ok(r.includes('/plugin marketplace add Nicholas-Shore-Chemistry/ctx-meter'));
  assert.ok(r.includes('/plugin install ctx-meter@ctx-meter'));
});

test('README names /ctx-meter:setup and /ctx-meter:teardown', () => {
  const r = read('README.md');
  assert.ok(r.includes('/ctx-meter:setup'));
  assert.ok(r.includes('/ctx-meter:teardown'));
});

test('README has no Ovid/claude-context install line', () => {
  const r = read('README.md');
  assert.doesNotMatch(r, /marketplace add Ovid/i);
  assert.doesNotMatch(r, /\/plugin install claude-context/i);
  assert.doesNotMatch(r, /Ovid\/claude-context\/issues/i);
});

test('README has a section on what the fork adds and links the issue tracker', () => {
  const r = read('README.md');
  assert.match(r, /^## What this fork adds/m);
  assert.ok(r.includes('https://github.com/Nicholas-Shore-Chemistry/ctx-meter/issues'));
  assert.match(r, /\/claude-context:teardown/);
});

test('CHANGELOG has a 0.4.0 entry naming ctx-meter', () => {
  const c = read('CHANGELOG.md');
  assert.match(c, /^## 0\.4\.0$/m);
  const entry = c.split(/^## /m).find((s) => s.startsWith('0.4.0'));
  assert.match(entry, /ctx-meter/);
  assert.match(entry, /matched_by/);
  assert.doesNotMatch(c, /^## Unreleased/m);
});
