// tests/command.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { buildStatuslineCommand } from '../plugins/ctx-meter/scripts/lib/command.mjs';
import { detectMarker } from '../plugins/ctx-meter/scripts/lib/marker.mjs';

test('marker round-trips through the built command, for both variants', () => {
  for (const variant of ['collect', 'coexist']) {
    assert.equal(
      detectMarker(buildStatuslineCommand({ variant, runtime: '/usr/bin/node' })),
      variant,
    );
  }
});

test('the built command targets the right script and is a single bash -c string', () => {
  const cmd = buildStatuslineCommand({ variant: 'coexist', runtime: '/usr/bin/node' });
  assert.match(cmd, /^bash -c '/);
  assert.match(cmd, /scripts\/coexist\.mjs/);
});

test('bad inputs throw', () => {
  assert.throws(() => buildStatuslineCommand({ variant: 'nope', runtime: '/usr/bin/node' }));
  assert.throws(() => buildStatuslineCommand({ variant: 'collect', runtime: '' }));
});

test('version resolution sorts by version field, not whole-line (no cache-id sort bug, I1)', () => {
  const cmd = buildStatuslineCommand({ variant: 'collect', runtime: '/usr/bin/node' });
  // A whole-line `sort -V` orders by the cache-id dir that precedes the version, so it could
  // launch an older version. The glob (identical on POSIX and Git Bash) must use the awk
  // version-field sort instead (I1).
  assert.match(cmd, /awk -F\//);
  assert.doesNotMatch(cmd, /sort -V/);
});

test('a bun runtime gets --env-file /dev/null so it does not auto-load the project .env (I2)', () => {
  for (const runtime of ['bun', '/opt/homebrew/bin/bun']) {
    const cmd = buildStatuslineCommand({ variant: 'coexist', runtime });
    assert.match(cmd, /--env-file \/dev\/null/, `bun must neutralize .env: ${runtime}`);
  }
  // node must NOT get the flag.
  assert.doesNotMatch(
    buildStatuslineCommand({ variant: 'coexist', runtime: '/usr/bin/node' }),
    /--env-file/,
  );
});

// The runtime path is embedded in a persisted command re-run every ~300ms. A path
// carrying shell metacharacters must NOT be evaluated by the inner bash.
test('runtime is not shell-injectable into the persisted command', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-inj-'));
  for (const payload of [
    `$(touch ${path.join(dir, 'SUB')})`,
    `\`touch ${path.join(dir, 'BT')}\``,
  ]) {
    const cmd = buildStatuslineCommand({ variant: 'collect', runtime: payload });
    spawnSync('bash', ['-c', cmd], {
      input: '{}',
      encoding: 'utf8',
      env: { ...process.env, CLAUDE_CONFIG_DIR: dir, HOME: dir },
    });
  }
  assert.equal(fs.existsSync(path.join(dir, 'SUB')), false, '$( ) in runtime must not execute');
  assert.equal(fs.existsSync(path.join(dir, 'BT')), false, 'backticks in runtime must not execute');
});

// A legitimate runtime path containing a space must still exec (single-quoting, not rejection).
test('a runtime path with a space still execs the target script', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sp ace-'));
  const scriptDir = path.join(cfg, 'plugins', 'cache', 'mk', 'ctx-meter', '0.3.0', 'scripts');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.writeFileSync(path.join(scriptDir, 'collect.mjs'), 'console.log("SPACE-OK");');
  // A wrapper "node" launcher living under a spaced path.
  const spaced = path.join(cfg, 'my runtime', 'node');
  fs.mkdirSync(path.dirname(spaced), { recursive: true });
  fs.writeFileSync(spaced, `#!/bin/sh\nexec "${process.execPath}" "$@"\n`, { mode: 0o755 });
  const cmd = buildStatuslineCommand({ variant: 'collect', runtime: spaced });
  const out = execFileSync('bash', ['-c', cmd], {
    input: '{}',
    env: { ...process.env, CLAUDE_CONFIG_DIR: cfg, HOME: cfg },
    encoding: 'utf8',
  });
  assert.match(out, /SPACE-OK/);
});

// A git-subdir marketplace source caches the plugin as <version>-<commit sha>, e.g.
// `0.4.0-ad2f7cf2bf2a`. The old filter required whitespace right after x.y.z, matched
// nothing, left plugin_dir empty, and the statusline silently ran nothing.
function fakeInstall(cfg, folder, tag) {
  const scriptDir = path.join(cfg, 'plugins', 'cache', 'mk', 'ctx-meter', folder, 'scripts');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.writeFileSync(path.join(scriptDir, 'collect.mjs'), `console.log(${JSON.stringify(tag)});`);
}

function runCollect(cfg) {
  const cmd = buildStatuslineCommand({ variant: 'collect', runtime: process.execPath });
  return spawnSync('bash', ['-c', cmd], {
    input: '{}',
    env: { ...process.env, CLAUDE_CONFIG_DIR: cfg, HOME: cfg },
    encoding: 'utf8',
  }).stdout;
}

test('a <version>-<sha> cache folder (git-subdir install) is resolved', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sha-'));
  fakeInstall(cfg, '0.4.0-ad2f7cf2bf2a', 'SHA-OK');
  assert.match(runCollect(cfg), /SHA-OK/);
});

test('suffixed and plain folders still sort by version number', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sha-sort-'));
  fakeInstall(cfg, '0.4.9-aaaaaaaaaaaa', 'OLD');
  fakeInstall(cfg, '0.4.10-bbbbbbbbbbbb', 'NEW');
  fakeInstall(cfg, '0.4.2', 'PLAIN-OLD');
  assert.match(runCollect(cfg), /NEW/);
});

test('non-version cache folders are still ignored', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-sha-junk-'));
  fakeInstall(cfg, '0.3.0-abc123', 'REAL');
  fakeInstall(cfg, 'temp_git_99', 'JUNK');
  fakeInstall(cfg, '9.9.9x', 'JUNK2');
  assert.match(runCollect(cfg), /REAL/);
});

// End-to-end: the built command must actually execute and exec the resolved script.
// This is the real guard against single-quote escaping bugs in the ported bash body.
test('the built command resolves the newest plugin dir and execs the target script', () => {
  const cfg = fs.mkdtempSync(path.join(os.tmpdir(), 'cc-cmd-'));
  // Fake an installed plugin: <cfg>/plugins/cache/mk/ctx-meter/0.3.0/scripts/coexist.mjs
  const scriptDir = path.join(cfg, 'plugins', 'cache', 'mk', 'ctx-meter', '0.3.0', 'scripts');
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.writeFileSync(path.join(scriptDir, 'coexist.mjs'), 'console.log("EXEC-OK");');
  const cmd = buildStatuslineCommand({ variant: 'coexist', runtime: process.execPath });
  const out = execFileSync('bash', ['-c', cmd], {
    input: '{}',
    env: { ...process.env, CLAUDE_CONFIG_DIR: cfg, HOME: cfg },
    encoding: 'utf8',
  });
  assert.match(out, /EXEC-OK/);
});
