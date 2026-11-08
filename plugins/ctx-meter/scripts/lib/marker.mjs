// The ownership marker embedded in every statusLine command ctx-meter writes, so
// setup/teardown can recognize its own slot without exact-matching a resolved command
// string (which legitimately changes across plugin upgrades, bun-vs-node, CLAUDE_CONFIG_DIR).
export const MARKER_VAR = 'CTX_METER_WRAPPER';

const VARIANTS = new Set(['collect', 'coexist']);

export function markerAssignment(variant) {
  if (!VARIANTS.has(variant)) throw new Error(`bad marker variant: ${variant}`);
  return `${MARKER_VAR}=${variant}`;
}

// Anchored so a longer name (=coexistence, =collector) is NOT read as our slot: the
// variant must be followed by a non-identifier char (separator or end-of-string).
const MARKER_RE = new RegExp(`${MARKER_VAR}=(coexist|collect)(?![A-Za-z0-9_])`);

export function detectMarker(command) {
  if (typeof command !== 'string') return null;
  const m = command.match(MARKER_RE);
  return m ? m[1] : null;
}

// The marker the upstream claude-context plugin wrote. It is not ours: setup refuses while it is
// wired (two collectors otherwise), and teardown leaves it for /claude-context:teardown.
export const LEGACY_MARKER_VAR = 'CLAUDE_CONTEXT_WRAPPER';
const LEGACY_MARKER_RE = new RegExp(`${LEGACY_MARKER_VAR}=(coexist|collect)(?![A-Za-z0-9_])`);

export function detectLegacyMarker(command) {
  return typeof command === 'string' && LEGACY_MARKER_RE.test(command);
}
