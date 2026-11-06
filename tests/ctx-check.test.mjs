// tests/ctx-check.test.mjs
// Fixtures under tests/fixtures/ctx-check/ are redacted cuts of REAL transcripts (usage
// fields and structure kept, text redacted); see CLAUDE.md "golden fixtures".
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const script = path.join(root, 'plugins/claude-context/scripts/ctx-check.mjs');
const configDir = path.join(root, 'tests/fixtures/ctx-check/config');

function run(args, env = {}) {
  const r = spawnSync(process.execPath, [script, ...args], {
    encoding: 'utf8',
    env: { PATH: process.env.PATH, CLAUDE_CONFIG_DIR: configDir, ...env },
  });
  const lines = r.stdout.trim().split('\n');
  assert.equal(lines.length, 1, 'exactly one JSON line');
  return { status: r.status, out: JSON.parse(lines[0]) };
}

test('main transcript when neither --agent-id nor --tag', () => {
  const { status, out } = run(['--session-id', 'sess-0001']);
  assert.equal(status, 0);
  assert.equal(out.context_tokens, 89511);
  assert.equal(out.context_k, 90);
  assert.equal(out.turns, 5);
  assert.equal(out.agent_id, null);
  assert.equal(out.spawn_depth, null);
  assert.equal(out.source, 'transcript');
  assert.ok(out.transcript.endsWith('sess-0001.jsonl'));
});

test('session id defaults to CLAUDE_CODE_SESSION_ID', () => {
  const { status, out } = run([], { CLAUDE_CODE_SESSION_ID: 'sess-0001' });
  assert.equal(status, 0);
  assert.equal(out.context_tokens, 89511);
});

test('--agent-id reads that sub-agent, with depth from meta', () => {
  const { status, out } = run(['--session-id', 'sess-0001', '--agent-id', 'aaaa1111']);
  assert.equal(status, 0);
  assert.equal(out.context_tokens, 45546);
  assert.equal(out.turns, 6);
  assert.equal(out.agent_id, 'aaaa1111');
  assert.equal(out.spawn_depth, 1);
});

test('depth-2 agent reports spawn_depth 2', () => {
  const { out } = run(['--session-id', 'sess-0001', '--agent-id', 'bbbb2222']);
  assert.equal(out.context_tokens, 38524);
  assert.equal(out.turns, 1);
  assert.equal(out.spawn_depth, 2);
});

test('--tag with exactly one match resolves the agent', () => {
  const { status, out } = run(['--session-id', 'sess-0001', '--tag', 'orch-alpha-1']);
  assert.equal(status, 0);
  assert.equal(out.agent_id, 'aaaa1111');
  assert.equal(out.context_tokens, 45546);
});

test('--tag matching several agents is ambiguous and lists them', () => {
  const { status, out } = run(['--session-id', 'sess-0001', '--tag', 'orch-beta']);
  assert.equal(status, 2);
  assert.equal(out.error, 'ambiguous_tag');
  assert.match(out.detail, /bbbb2222/);
  assert.match(out.detail, /cccc3333/);
});

test('--tag matching nothing is not_found', () => {
  const { status, out } = run(['--session-id', 'sess-0001', '--tag', 'no-such-tag']);
  assert.equal(status, 2);
  assert.equal(out.error, 'not_found');
});

test('unknown agent id is not_found', () => {
  const { status, out } = run(['--session-id', 'sess-0001', '--agent-id', 'zzzz']);
  assert.equal(status, 2);
  assert.equal(out.error, 'not_found');
});

test('unknown session is no_session; missing session id too', () => {
  const a = run(['--session-id', 'nope']);
  assert.equal(a.status, 2);
  assert.equal(a.out.error, 'no_session');
  const b = run([]);
  assert.equal(b.status, 2);
  assert.equal(b.out.error, 'no_session');
});

test('transcript without assistant usage is no_usage', () => {
  const { status, out } = run(['--session-id', 'sess-0001', '--agent-id', 'cccc3333']);
  assert.equal(status, 2);
  assert.equal(out.error, 'no_usage');
});

test('--agent-id and --tag together is bad_args; so is a path-like agent id', () => {
  const a = run(['--session-id', 'sess-0001', '--agent-id', 'aaaa1111', '--tag', 'x']);
  assert.equal(a.status, 2);
  assert.equal(a.out.error, 'bad_args');
  const b = run(['--session-id', 'sess-0001', '--agent-id', '../x']);
  assert.equal(b.out.error, 'bad_args');
  const c = run(['--session-id', 'sess-0001', '--bogus']);
  assert.equal(c.out.error, 'bad_args');
});

test('turns dedupes assistant lines sharing a message id; bad JSON lines are skipped', () => {
  const count = (rel) => {
    let lines = 0;
    for (const l of fs
      .readFileSync(path.join(configDir, 'projects/proj-a', rel), 'utf8')
      .split('\n')) {
      try {
        if (JSON.parse(l).type === 'assistant') lines++;
      } catch {
        /* bad line */
      }
    }
    return lines;
  };
  assert.equal(count('sess-0001/subagents/agent-bbbb2222.jsonl'), 2, 'two lines, one API message');
  assert.equal(run(['--session-id', 'sess-0001', '--agent-id', 'bbbb2222']).out.turns, 1);
  assert.ok(
    fs
      .readFileSync(path.join(configDir, 'projects/proj-a/sess-0001.jsonl'), 'utf8')
      .includes('not json'),
  );
  assert.equal(run(['--session-id', 'sess-0001']).out.turns, 5);
});

test('output contains no advice or thresholds (facts only)', () => {
  const { out } = run(['--session-id', 'sess-0001']);
  assert.deepEqual(Object.keys(out).sort(), [
    'agent_id',
    'context_k',
    'context_tokens',
    'source',
    'spawn_depth',
    'transcript',
    'turns',
  ]);
});

// Own-tag resolution: fixtures are generated in a temp config dir (synthetic, neutral tags).
function makeSession(agents) {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'ctx-check-tag-'));
  const sub = path.join(cfg, 'projects/p/sess-tag/subagents');
  fs.mkdirSync(sub, { recursive: true });
  fs.writeFileSync(path.join(cfg, 'projects/p/sess-tag.jsonl'), '');
  for (const [id, text] of Object.entries(agents)) {
    const user = { type: 'user', message: { role: 'user', content: text } };
    const asst = {
      type: 'assistant',
      message: { id: `m-${id}`, usage: { input_tokens: 1000, output_tokens: 1 } },
    };
    fs.writeFileSync(
      path.join(sub, `agent-${id}.jsonl`),
      `${JSON.stringify(user)}\n${JSON.stringify(asst)}\n`,
    );
  }
  return cfg;
}

function runTag(agents, tag) {
  const cfg = makeSession(agents);
  try {
    return run(['--session-id', 'sess-tag', '--tag', tag], { CLAUDE_CONFIG_DIR: cfg });
  } finally {
    fs.rmSync(cfg, { recursive: true, force: true });
  }
}

const subOrchGrunt = {
  so01: 'ORCH-RUN: demo PATHWAY: slow\nORCH-TAG: run1-a1b2\nBrief. Spawn the grunt with:\nGRUNT-TAG: run1-a1b2-grunt\n',
  gr01: 'ORCH-RUN: demo PATHWAY: slow\nGRUNT-TAG: run1-a1b2-grunt\nDo the mechanical task.\n',
};

test('--tag sub-orch tag selects the sub-orch, not the grunt quoted in its brief', () => {
  const { status, out } = runTag(subOrchGrunt, 'run1-a1b2');
  assert.equal(status, 0);
  assert.equal(out.agent_id, 'so01');
});

test('--tag grunt tag selects the grunt, not the sub-orch whose brief quotes it', () => {
  const { status, out } = runTag(subOrchGrunt, 'run1-a1b2-grunt');
  assert.equal(status, 0);
  assert.equal(out.agent_id, 'gr01');
});

test('--tag is an exact match on the own tag: a prefix of it falls back to substring', () => {
  // 'run1-a1' is no own tag, so the substring fallback runs and sees both first messages.
  const { status, out } = runTag(subOrchGrunt, 'run1-a1');
  assert.equal(status, 2);
  assert.equal(out.error, 'ambiguous_tag');
  // An exact own tag never reaches the fallback, even though it is a prefix of another.
  assert.equal(runTag(subOrchGrunt, 'run1-a1b2').out.agent_id, 'so01');
});

test('two agents with the same own tag are ambiguous', () => {
  const { status, out } = runTag(
    { aa01: 'ORCH-TAG: run1-dup\nx', bb02: 'GRUNT-TAG: run1-dup\ny' },
    'run1-dup',
  );
  assert.equal(status, 2);
  assert.equal(out.error, 'ambiguous_tag');
  assert.match(out.detail, /aa01/);
  assert.match(out.detail, /bb02/);
});

test('first message without a tag line falls back to substring match', () => {
  const { status, out } = runTag(
    { aa01: 'Please work on marker run1-zz9 today.', bb02: 'ORCH-TAG: run1-other\n' },
    'run1-zz9',
  );
  assert.equal(status, 0);
  assert.equal(out.agent_id, 'aa01');
});

test('a later tag line in the first message is not an own tag', () => {
  // aa01 quotes run1-second on line 3; bb02 really owns it. Exact match must find bb02 only.
  const { status, out } = runTag(
    {
      aa01: 'ORCH-RUN: demo\nORCH-TAG: run1-first\nGRUNT-TAG: run1-second\n',
      bb02: 'ORCH-RUN: demo\nGRUNT-TAG: run1-second\n',
    },
    'run1-second',
  );
  assert.equal(status, 0);
  assert.equal(out.agent_id, 'bb02');
});

test('a mid-line tag mention is not an own tag; the tag line at line start is', () => {
  // aa01 mentions "GRUNT-TAG: run1-other" mid-line before its real own tag; bb02 owns run1-other.
  const { status, out } = runTag(
    {
      aa01: 'ORCH-RUN: demo see GRUNT-TAG: run1-other\nORCH-TAG: run1-real\n',
      bb02: 'ORCH-RUN: demo\nORCH-TAG: run1-other\n',
    },
    'run1-other',
  );
  assert.equal(status, 0);
  assert.equal(out.agent_id, 'bb02');
});

test('--tag matching nothing is not_found even with own tags present', () => {
  const { status, out } = runTag(subOrchGrunt, 'run9-none');
  assert.equal(status, 2);
  assert.equal(out.error, 'not_found');
});
