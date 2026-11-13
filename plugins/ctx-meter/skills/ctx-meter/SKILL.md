---
description: "Report this session's context use, 5h/7d plan usage and cost as plain facts. For users and agents."
name: ctx-meter
---

# ctx-meter

Reports this session's resource facts: context use, 5h and 7d subscription usage, cost,
compactions. It is an instrument, not an advisor: facts only: pass the measurements through as-is,
with no recommendations, urgency or thresholds of your own. The caller's instructions set
the policy.

## Run

```bash
RT=$(command -v bun 2>/dev/null || command -v node 2>/dev/null)
"$RT" "${CLAUDE_PLUGIN_ROOT}/scripts/report.mjs" --session-id "${CLAUDE_SESSION_ID}" --format brief
```

Three lines at most. Add `--format json` when you need every field. It always succeeds.

### First use

If the output has `setup_required=true` (JSON: `"setup_required": true`), the collector has
never run. Read `${CLAUDE_PLUGIN_ROOT}/commands/setup.md` and follow it exactly, including
its proceed/cancel confirm when a foreign statusline owns the slot and its stop on native
PowerShell. If setup wires the collector, run the report once more and relay that. If setup
is cancelled or stops, relay the first report as it is.

## What to gate on

- `context.used_percentage` (brief: `ctx N%`): the session's context window, not a
  subagent's own.
- `rate_limits.five_hour` / `seven_day` `.used_percentage` (brief: `5h`, `7d`): account-wide,
  shared with every subagent.
- `rate_limits_status`: `available`, or why the numbers are missing.
- `setup_required`: true only when no collector snapshot has ever been written.
- `session_selection`: `session_id` means the numbers are your session's;
  `unverified-snapshot` means the newest snapshot was used and context may be a neighbour's.

`source` and `snapshot_age_seconds` say where a number came from and how old it is. Read
`${CLAUDE_PLUGIN_ROOT}/skills/ctx-meter/reference.md` only if a field is unclear.

## Sub-agents: ctx-check

`report.mjs` returns the parent session's context, which a sub-agent shares. For one
agent's own context run:

```bash
"$RT" "${CLAUDE_PLUGIN_ROOT}/scripts/ctx-check.mjs" --brief [--session-id <id>] [--agent-id <id> | --tag <text>]
```

`--tag` matches the `ORCH-TAG:` or `GRUNT-TAG:` line of a sub-agent's first message.
Output: `{"context_k":87,"turns":41}`, plus `matched_by` when it is `"substring"` (a
fallback that can pick an agent that only quotes the tag; check it). Errors are
`{"error": ...}` with exit code 2. Measurements only.
