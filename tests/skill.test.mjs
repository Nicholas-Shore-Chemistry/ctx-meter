// tests/skill.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const skill = readFileSync(
  path.join(root, 'plugins', 'ctx-meter', 'skills', 'ctx-meter', 'SKILL.md'),
  'utf8',
);

test('skill first-use runs setup when the report says setup_required', () => {
  assert.match(skill, /"setup_required": true/);
  assert.match(skill, /\$\{CLAUDE_PLUGIN_ROOT\}\/commands\/setup\.md/);
});

test("skill first-use defers to setup's confirm", () => {
  assert.match(skill, /foreign/i);
  assert.match(skill, /proceed\/cancel confirm/);
});

test('frontmatter declares name and description', () => {
  assert.match(skill, /^---\r?\n[\s\S]*\r?\nname:\s*ctx-meter\b/m);
  assert.match(skill, /^description:\s*.+/m);
});

test('tells Claude to run report.mjs', () => {
  assert.match(skill, /scripts\/report\.mjs/);
});

test('states the data-only contract and tells the caller not to editorialize', () => {
  assert.match(skill, /instrument, not an? advisor/i);
  assert.match(skill, /pass the measurements through as-is/i);
  // The enforceable no-advice guarantee lives in Task 9 (denylist over report.mjs
  // OUTPUT). This doc legitimately uses words like "recommendations" / "you should"
  // to describe what the caller must NOT add, so grepping the doc for that
  // vocabulary would false-positive on the contract's own statement.
});

test('documents whose numbers these are (session context vs account usage)', () => {
  assert.match(skill, /account-wide/i);
  assert.match(skill, /\bsession\b/i);
  assert.match(skill, /\bsubagent\b/i);
});

test('documents ctx-check for sub-agents', () => {
  assert.match(skill, /## Sub-agents: ctx-check/);
  assert.match(skill, /scripts\/ctx-check\.mjs/);
});

test('description is at most 350 characters and names context, 5h, 7d, cost', () => {
  const d = skill.match(/^description:\s*(.+)$/m)[1].trim();
  assert.ok(d.length <= 350, `description is ${d.length} chars`);
  for (const w of [/context/i, /5h/, /7d/, /cost/i]) assert.match(d, w);
});

test('frontmatter is valid YAML: plain scalars hold no ": ", name and description non-empty', () => {
  const fm = skill.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---\n/);
  assert.ok(fm, 'frontmatter block present');
  const fields = {};
  for (const line of fm[1].split('\n')) {
    const m = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    assert.ok(m, `top-level key: value line expected, got: ${line.slice(0, 40)}`);
    let v = m[2].trim();
    const quoted = /^"(?:[^"\\]|\\.)*"$/.test(v) || /^'(?:[^']|'')*'$/.test(v);
    if (!quoted) {
      assert.ok(!/: /.test(v), `unquoted plain scalar for ${m[1]} contains ": "`);
      assert.ok(!/ #/.test(v), `unquoted plain scalar for ${m[1]} contains " #"`);
    } else {
      v = v.slice(1, -1);
    }
    fields[m[1]] = v;
  }
  assert.ok(fields.name && fields.name.length > 0, 'name non-empty');
  assert.ok(fields.description && fields.description.length > 0, 'description non-empty');
});
