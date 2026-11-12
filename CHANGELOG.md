# Changelog

## 0.4.1

- **Fix: the statusline finds a `<version>-<sha>` cache folder.** A marketplace that pulls
  ctx-meter from git (`git-subdir`, as NestOr does) caches it as e.g. `0.4.0-ad2f7cf2bf2a`.
  The version filter required whitespace right after `x.y.z`, so it matched nothing, the
  wired statusline ran no script and no snapshot was ever written. The filter now accepts an
  optional `-<suffix>` or `+<suffix>`; sorting is unchanged. Re-run `/ctx-meter:setup` after
  updating to rewrite the wired command.

## 0.4.0

First public release of this fork, renamed `ctx-meter`. Created by Ovid
([Ovid/claude-context](https://github.com/Ovid/claude-context)), extended by Nicholas Shore.

- **Renamed to `ctx-meter`.** The plugin, the marketplace, the commands (`/ctx-meter`,
  `/ctx-meter:setup`, `/ctx-meter:teardown`), the config directory (`<config>/ctx-meter`) and
  the statusline marker all use the new name. There is no compatibility shim: remove the old
  `claude-context` wiring first.
- **Setup refuses while `claude-context` is wired.** Run `/claude-context:teardown`, then
  `/ctx-meter:setup`; nothing is changed until you do.
- **Setup and teardown are user-only.** Both set `disable-model-invocation: true`, so Claude
  can't start them on its own.
- **Shorter report description.** The always-loaded skill description is shorter.
- **`ctx-check.mjs` reports `matched_by`.** With `--tag` it says whether the agent matched by
  its own tag (`own_tag`) or by the fallback substring match (`substring`); without `--tag` it
  is `null`.
- **`ctx-check.mjs --tag` matches an agent's own tag.** The own tag is the value on the first
  `ORCH-TAG:`/`GRUNT-TAG:` line of the agent's first message; `--tag` selects agents whose own
  tag equals the value exactly, so two agents whose tags merely start the same no longer give
  `ambiguous_tag`. If no agent matches that way it falls back to the old substring match.
  Identical own tags stay ambiguous.
- **Setup keeps other `statusLine` keys** such as `refreshInterval` and `padding`, on wrap and
  on teardown.
- **Fixes.** The skill description is quoted so the skill loads with its name and description.
  `ctx-check.mjs --tag` also knows `NESTOR-TAG:`. A sidecar restore on teardown still writes
  back the original `statusLine` unchanged, string or array included. Only the backup fallback
  drops a `statusLine` that is not a plain object with a non-blank string `command`.
- **License and credit.** `LICENSE` keeps Ovid's notice and adds Nicholas Shore; the README and
  both manifests credit Ovid first.

## 0.3.4

Release of this fork.

- **`ctx-check.mjs`: a sub-agent's own context.** A sub-agent shares its parent's session id,
  so `report.mjs` gives it the parent session's number. `scripts/ctx-check.mjs` reads one
  agent's context (last assistant message's input + cache read + cache creation tokens) and
  turn count from its own transcript, addressed by `--agent-id` or by a `--tag` text found
  in the agent's first message; it also reports `spawn_depth` from the agent's meta file.
  Facts only, one JSON line, errors as `{"error", "detail"}` with exit 2. Documented in the
  skill under "Sub-agents: ctx-check". The report is unchanged.

## 0.3.3

Release of this fork.

- **Statusline: tokens and reset countdowns.** The collector's own line shows tokens used
  against the model window and the auto-compact window, next to the percentages, plus the
  time until each 5h/7d window resets (`Context 84k/1M 8% · 84k/400k 21% · 5h 50% 1h 49m ·
  7d 18% 5d 18h`). A 1M window prints as `1M`, not `1000k`. The report is unchanged.
- **`/claude-context` runs the report.** The skill moved from the plugin root to
  `skills/claude-context/SKILL.md`. Claude Code loads plugin skills only from `skills/`,
  so before this the report skill was never registered and `/claude-context` completed
  to `/claude-context:setup`.
- **First use sets up.** When the report says `setup_required: true`, the skill runs the
  setup flow (with its usual confirm before touching a foreign statusline), then reports.

## 0.3.2

Release of this fork. Two fixes; existing fields and states are
unchanged when no auto-compact window is configured.

- **Auto-compact window:** the report reads the configured auto-compact window
  (`CLAUDE_CODE_AUTO_COMPACT_WINDOW`, or `autoCompactWindow` per model under
  `modelSettings` or at the top level of local/project/user settings) and adds
  `auto_compact_window`, its source, and usage and headroom against it, capped at the model
  window. Before, usage was measured only against the model window (e.g. 1M) while Claude
  Code compacted at the configured 400k. Only those keys are read from settings.
- **Setup on Windows:** setup asks the Git Bash that Claude Code runs (its Bash tool, or
  `bin\bash.exe` next to `git` / `CLAUDE_CODE_GIT_BASH_PATH`) for `$OSTYPE`, instead of
  reading `$OSTYPE` in the session's own shell. A PowerShell session on a machine with Git
  Bash installed is no longer refused. WSL's `bash.exe` (`linux-gnu`) still takes the native
  stop.

## 0.3.1

Bug-fix and hardening release over 0.3.0. No new features; the co-existing statusline and
the report's shape are unchanged.

- **`compactions` reports `null`, never a fabricated `0`,** when the transcript can't be
  read or its path is absent — so a rule keyed on the compaction count never acts on an
  invented value.
- **Session identity:** the report falls through to the `CLAUDE_CODE_SESSION_ID` env var
  when the passed `--session-id` is empty or unexpanded, instead of degrading to another
  session's newest snapshot.
- **Bun support:** setup, teardown, and the statusline resolve `bun` or `node` rather than
  hardcoding `node`; under Bun the collector runs with `--env-file /dev/null` so it can't
  auto-load the project's `.env`.
- **Secret redaction:** the setup preview masks many more credential shapes (AWS/Google/
  Slack keys, JWTs, basic-auth URLs, positional and abbreviated tokens), so a wrapped
  statusline command can't leak secrets into the setup transcript.
- **Setup/teardown robustness:** never clobber the one-time settings backup on re-setup;
  never strand a temp file on a failed write; recover the original statusline from the
  backup when the sidecar is lost; restore a command-less original verbatim; refuse to
  seize a slot whose marker isn't ours.
- **Command safety:** the runtime path is single-quoted in the persisted statusline command,
  so a path containing shell metacharacters can't execute.
- **Git Bash:** the plugin-dir resolver filters to semver directories and sorts by version
  field (matching POSIX), always launching the newest installed version rather than an older
  cached one.
- **Fail-safe statusline:** a stdin stream error or a failed spawn of the wrapped original
  degrades to our own line instead of blanking the statusline.
- **Docs:** the README flags alpha status up front, explains why the plugin needs a
  statusline (and why the built-in `/context` can't replace it for agents — it has no
  programmatic entry point and can't see usage/cost/compactions), shows how a `CLAUDE.md`
  rule reads the report's JSON fields, and documents the Windows limitations (POSIX-only
  file modes, the `bash` dependency, `settings.json` normalization).

## 0.3.0

- **Co-existing statusline.** `/claude-context:setup` now wraps an existing (foreign)
  statusline instead of offering replace-or-keep: both run, your displayed line is unchanged,
  and the new `/claude-context:teardown` restores the original verbatim. Setup never replaces
  or seizes a slot it doesn't own.
- **New `/claude-context:teardown` command.**
- **BREAKING (native PowerShell/cmd):** this release removes the empty-slot PowerShell
  collector shipped in 0.2.0. Native PowerShell/cmd is unsupported this alpha; setup makes no
  settings change there. Use Git Bash for live numbers. POSIX and Windows + Git Bash are
  wired as before (now via the tested `wiring.mjs` module).

## 0.2.0

- Reporting now requires the collector: with no snapshot ever written, the report
  returns a not-set-up state (all-null values, new `setup_required: true`, and a
  human block explaining `/claude-context:setup`) instead of inferring the context
  window from the transcript. Removed the `window_size_inferred` field and the
  `model-window` inference module. A stale snapshot still reports accurate context
  (from the transcript, or the snapshot's own field) flagged `unavailable_stale`.
- Repository relocated the shipped plugin into `plugins/claude-context/` so
  `/plugin install` copies a lean tree (docs, tests, and dev infra stay at the root).

## 0.1.0

- Initial release: `/claude-context:claude-context` skill, opt-in `collect.mjs`
  statusline collector, `report.mjs` engine with snapshot → transcript → cold-start
  degradation, and `/claude-context:setup`. Pure measurements and provenance; no
  recommendations, labels, policy, or derived metrics.
