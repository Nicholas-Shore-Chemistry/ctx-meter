// tests/manifest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const readJson = (rel) => JSON.parse(readFileSync(path.join(root, rel), 'utf8'));

test('plugin.json has required fields', () => {
  const m = readJson('plugins/ctx-meter/.claude-plugin/plugin.json');
  assert.equal(m.name, 'ctx-meter');
  assert.match(m.version, /^\d+\.\d+\.\d+$/);
  assert.ok(m.commands.includes('./commands/setup.md'));
  assert.equal(m.skills, undefined, 'skills/ is auto-discovered');
  const plugin = path.join(root, 'plugins', 'ctx-meter');
  assert.ok(existsSync(path.join(plugin, 'skills', 'ctx-meter', 'SKILL.md')));
  assert.ok(
    !existsSync(path.join(plugin, 'SKILL.md')),
    'a root SKILL.md is not loaded by Claude Code',
  );
});

test('plugin.json registers both setup and teardown commands', () => {
  const m = readJson('plugins/ctx-meter/.claude-plugin/plugin.json');
  assert.ok(m.commands.includes('./commands/setup.md'));
  assert.ok(m.commands.includes('./commands/teardown.md'));
});

test('marketplace.json points at this plugin', () => {
  const m = readJson('.claude-plugin/marketplace.json');
  assert.equal(m.name, 'ctx-meter');
  assert.equal(m.plugins[0].name, 'ctx-meter');
  assert.equal(m.plugins[0].source, './plugins/ctx-meter');
  assert.match(m.version, /^\d+\.\d+\.\d+$/); // top-level (canonical) — NOT metadata.version
  assert.equal(typeof m.description, 'string'); // top-level (canonical) — NOT metadata.description
});

test('the three version fields agree (root package.json is private but must not drift)', () => {
  const pkg = readJson('package.json').version;
  const plugin = readJson('plugins/ctx-meter/.claude-plugin/plugin.json').version;
  const marketplace = readJson('.claude-plugin/marketplace.json').version;
  assert.equal(plugin, marketplace, 'plugin.json and marketplace.json versions must match');
  assert.equal(pkg, plugin, 'root package.json version must match the shipped plugin version');
});

test('author and owner name Ovid first', () => {
  const plugin = readJson('plugins/ctx-meter/.claude-plugin/plugin.json');
  const market = readJson('.claude-plugin/marketplace.json');
  assert.equal(plugin.author.name, 'Ovid, Nicholas Shore');
  assert.equal(market.owner.name, 'Ovid, Nicholas Shore');
});

test('setup and teardown are user-only (disable-model-invocation)', () => {
  for (const f of ['setup', 'teardown']) {
    const t = readFileSync(path.join(root, 'plugins', 'ctx-meter', 'commands', f + '.md'), 'utf8');
    const fm = t.match(/^---\r?\n([\s\S]*?)\r?\n---/)[1];
    assert.match(fm, /^disable-model-invocation:\s*true\s*$/m);
  }
});
