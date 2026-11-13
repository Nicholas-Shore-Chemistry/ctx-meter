// tests/jsonl-io.test.mjs: head/tail reading and the ctx-check --brief / --no-turns flags.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { findFirst, findLast } from '../plugins/ctx-meter/scripts/lib/jsonl-io.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = path.join(root, 'plugins/ctx-meter/scripts/ctx-check.mjs');
const fixtures = path.join(root, 'tests/fixtures/ctx-check/config');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ctxio-'));
const write = (name, lines) => {
  const f = path.join(tmp, name);
  fs.writeFileSync(f, lines.join('\n') + '\n');
  return f;
};
const isUser = (e) => e?.type === 'user';
const hasUsage = (e) => e?.type === 'assistant' && e?.message?.usage && typeof e.message.usage === 'object';
const asst = (n) => ({ type: 'assistant', message: { id: `m${n}`, usage: { input_tokens: n } } });

// Reference: the old full-parse behaviour.
function fullParse(file) {
  const out = [];
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    try {
      if (l.trim()) out.push(JSON.parse(l));
    } catch {
      /* skip */
    }
  }
  return out;
}

test('findLast on a transcript far larger than the chunk finds the last usage entry', () => {
  const lines = [];
  for (let i = 0; i < 400; i++) {
    lines.push(JSON.stringify({ type: 'user', message: { content: 'x'.repeat(700) + 'é' } }));
    lines.push(JSON.stringify(asst(i)));
  }
  lines.push('{"type":"user","message":{"content":"tail user"}}');
  lines.push('not json at all');
  const f = write('big.jsonl', lines);
  assert.ok(fs.statSync(f).size > 200_000);
  for (const chunk of [7, 64, 1000, 4096, 64 * 1024]) {
    const e = findLast(f, hasUsage, { chunk });
    assert.equal(e.message.usage.input_tokens, 399, `chunk ${chunk}`);
  }
  assert.deepEqual(findLast(f, hasUsage), fullParse(f).filter(hasUsage).at(-1));
});

test('findLast: single-line file, no trailing newline, none matching, missing file', () => {
  const one = path.join(tmp, 'one.jsonl');
  fs.writeFileSync(one, JSON.stringify(asst(5)));
  assert.equal(findLast(one, hasUsage, { chunk: 4 }).message.usage.input_tokens, 5);
  const none = write('none.jsonl', ['{"type":"user"}', 'garbage', '']);
  assert.equal(findLast(none, hasUsage, { chunk: 5 }), null);
  assert.equal(findLast(path.join(tmp, 'absent.jsonl'), hasUsage), null);
});

test('findFirst: first user entry after malformed lines and a very long first line', () => {
  const long = JSON.stringify({ type: 'user', message: { content: 'L'.repeat(300_000) } });
  const f = write('long.jsonl', ['{broken', '', JSON.stringify(asst(1)), long, JSON.stringify({ type: 'user', message: { content: 'second' } })]);
  for (const chunk of [16, 4096, 64 * 1024]) {
    const e = findFirst(f, isUser, { chunk });
    assert.equal(e.message.content.length, 300_000, `chunk ${chunk}`);
  }
  assert.deepEqual(findFirst(f, isUser), fullParse(f).find(isUser));
});

test('findFirst: last line without newline, no match, missing file', () => {
  const f = path.join(tmp, 'nonl.jsonl');
  fs.writeFileSync(f, '{"type":"assistant"}\n{"type":"user","message":{"content":"end"}}');
  assert.equal(findFirst(f, isUser, { chunk: 8 }).message.content, 'end');
  assert.equal(findFirst(write('nou.jsonl', ['{"type":"assistant"}']), isUser, { chunk: 3 }), null);
  assert.equal(findFirst(path.join(tmp, 'absent.jsonl'), isUser), null);
});

test('head/tail results equal a full parse on every ctx-check fixture', () => {
  const walk = (d) =>
    fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(d, e.name);
      return e.isDirectory() ? walk(p) : p.endsWith('.jsonl') ? [p] : [];
    });
  const files = [...walk(fixtures), path.join(root, 'tests/fixtures/real-transcript.jsonl'), path.join(root, 'tests/fixtures/session.jsonl')];
  for (const f of files) {
    const all = fullParse(f);
    for (const chunk of [32, 64 * 1024]) {
      assert.deepEqual(findFirst(f, isUser, { chunk }), all.find(isUser) ?? null, f);
      assert.deepEqual(findLast(f, hasUsage, { chunk }), all.filter(hasUsage).at(-1) ?? null, f);
    }
  }
});

function run(args) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: fixtures },
  });
  return { status: r.status, raw: r.stdout.trim(), out: JSON.parse(r.stdout.trim()) };
}

test('--brief prints context_k and turns only; matched_by only for substring', () => {
  const a = run(['--session-id', 'sess-0001', '--brief']);
  assert.deepEqual(a.out, { context_k: 90, turns: 5 });
  const b = run(['--session-id', 'sess-0001', '--tag', 'orch-alpha-1', '--brief']);
  assert.deepEqual(Object.keys(b.out).sort(), ['context_k', 'matched_by', 'turns'].filter((k) => k in b.out));
  assert.equal(b.out.context_k, 46);
  assert.ok(Buffer.byteLength(b.raw) < 60);
});

test('--no-turns keeps the full shape without turns, same numbers', () => {
  const full = run(['--session-id', 'sess-0001', '--agent-id', 'aaaa1111']).out;
  const fast = run(['--session-id', 'sess-0001', '--agent-id', 'aaaa1111', '--no-turns']).out;
  const { turns, ...rest } = full;
  assert.equal(turns, 6);
  assert.deepEqual(fast, rest);
  const none = run(['--session-id', 'sess-0001', '--agent-id', 'cccc3333', '--no-turns']);
  assert.equal(none.out.error, 'no_usage');
});

test('default output is unchanged (key set)', () => {
  const { out } = run(['--session-id', 'sess-0001']);
  assert.deepEqual(Object.keys(out).sort(), [
    'agent_id', 'context_k', 'context_tokens', 'matched_by', 'source', 'spawn_depth', 'transcript', 'turns',
  ]);
});
