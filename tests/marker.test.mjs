import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKER_VAR,
  markerAssignment,
  detectMarker,
  LEGACY_MARKER_VAR,
  detectLegacyMarker,
} from '../plugins/ctx-meter/scripts/lib/marker.mjs';

test('markerAssignment emits a stable env-assignment sentinel', () => {
  assert.equal(MARKER_VAR, 'CTX_METER_WRAPPER');
  assert.equal(markerAssignment('collect'), 'CTX_METER_WRAPPER=collect');
  assert.equal(markerAssignment('coexist'), 'CTX_METER_WRAPPER=coexist');
  assert.throws(() => markerAssignment('nope'));
});

test('detectMarker keys on presence + variant, not the resolved path', () => {
  // Different resolved paths, same variant → still detected.
  assert.equal(
    detectMarker('bash -c \'export CTX_METER_WRAPPER=coexist; exec "/a/node" x\''),
    'coexist',
  );
  assert.equal(
    detectMarker('bash -c \'export CTX_METER_WRAPPER=collect; exec "/b/bun" y\''),
    'collect',
  );
});

test('detectMarker returns null for foreign / empty / non-string', () => {
  assert.equal(detectMarker('bun run ~/.claude/claude-hud/statusline.js'), null);
  assert.equal(detectMarker(''), null);
  assert.equal(detectMarker(null), null);
  assert.equal(detectMarker(undefined), null);
});

test('detectMarker is anchored: a longer variant name is not our slot', () => {
  // Substring-only matching would claim these as ours; the assignment is anchored.
  assert.equal(detectMarker('export CTX_METER_WRAPPER=coexistence; exec x'), null);
  assert.equal(detectMarker('export CTX_METER_WRAPPER=collector; exec x'), null);
  // A trailing separator (`;`, space, end) still detects the real variant.
  assert.equal(detectMarker('export CTX_METER_WRAPPER=coexist; exec x'), 'coexist');
  assert.equal(detectMarker('export CTX_METER_WRAPPER=collect'), 'collect');
});

test('detectLegacyMarker finds CLAUDE_CONTEXT_WRAPPER=collect and =coexist', () => {
  assert.equal(LEGACY_MARKER_VAR, 'CLAUDE_CONTEXT_WRAPPER');
  assert.equal(detectLegacyMarker("bash -c 'export CLAUDE_CONTEXT_WRAPPER=collect; exec x'"), true);
  assert.equal(detectLegacyMarker('export CLAUDE_CONTEXT_WRAPPER=coexist; exec x'), true);
  assert.equal(detectLegacyMarker('export CTX_METER_WRAPPER=collect; exec x'), false);
  assert.equal(detectLegacyMarker(null), false);
});

test('detectLegacyMarker ignores CLAUDE_CONTEXT_WRAPPER=collector', () => {
  assert.equal(detectLegacyMarker('export CLAUDE_CONTEXT_WRAPPER=collector; exec x'), false);
  assert.equal(detectLegacyMarker('export CLAUDE_CONTEXT_WRAPPER=coexistence; exec x'), false);
});
