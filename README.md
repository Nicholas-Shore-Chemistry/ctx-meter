# ctx-meter

**Created by Ovid** ([Ovid/claude-context](https://github.com/Ovid/claude-context)), extended by Nicholas Shore.

> ⚠️ **Alpha software.** Early and actively changing: expect breaking changes between
> versions and rough edges. **macOS, Linux, and Windows + Git Bash only** (POSIX shells) —
> native PowerShell/cmd is unsupported this release. Everything setup touches is reversible
> with `/ctx-meter:teardown`.

**Your agents can't manage a budget they can't see.** `ctx-meter` lets Claude Code and its
subagents read their own context window, subscription usage and cost, as numbers.

Any agent in your session can ask how much has been used. It gets back context-window
occupancy, 5-hour and 7-day usage, session cost and compaction count, plus where each
figure came from and whether it is fresh. You write the rule. The agent reads the gauge.

## What it does

- Reports the session's context, 5h/7d usage, cost and compactions on demand, as a readable
  block and a JSON block.
- `ctx-check.mjs` reads one subagent's own context and turn count from its transcript,
  addressed by `--agent-id` or `--tag`, and says how the tag matched (`matched_by`). The
  report itself only sees the parent session's context.
- Measures usage and headroom against your auto-compact window too, if you set one.
- Puts used tokens, both windows and the time until the 5h and 7d resets on the statusline.
- Wraps a statusline you already run instead of replacing it. Extra `statusLine` keys such as
  `refreshInterval` and `padding` survive setup and teardown.
- On Windows, setup asks the Git Bash that Claude Code runs, so a PowerShell session on a
  machine with Git Bash is no longer refused.
- Setup and teardown can only be started by you, not by Claude. Setup stops while
  `claude-context` is still wired, so two collectors never run at once.

Details per release are in [CHANGELOG.md](./CHANGELOG.md).

## Why: auto-compaction happens silently

When a session fills up, Claude Code auto-compacts. It summarizes the conversation to make
room. Sometimes the summary drops the instructions you were relying on. Others have reported
it:

- Auto-compact loses the instructions from your most recent request —
  [claude-code#22376](https://github.com/anthropics/claude-code/issues/22376)
- Your `CLAUDE.md` project rules get summarized away and the agent stops following
  them — [claude-code#24460](https://github.com/anthropics/claude-code/issues/24460),
  [claude-code#6354](https://github.com/anthropics/claude-code/issues/6354)

An agent that cannot see its context percentage runs straight into that. One that can see
it can act first, if you give it a rule:

> *"Before context passes 50%, write the current plan and key decisions to
> `PROGRESS.md`, then stop for review."*
> *"Don't start a new subtask above 40% context."*

Subscription limits are just as hidden from an agent mid-task. Rules for those need the
numbers too:

> *"If we're about to cross 80% of the weekly limit, summarize progress and pause."*
> *"Don't fan out three subagents when the 5-hour window is nearly spent."*

## Instrument, not advisor

`ctx-meter` reports numbers and how far to trust them. It gives no advice: no built-in
thresholds, no "you should compact", no traffic lights. The idea is Ovid's, and I kept it
because it works. The plugin supplies the facts. Your `CLAUDE.md`, skills and subagent
prompts supply the policy. A tool with its own thresholds would only fight yours.

## Doesn't `/context` already show this?

At your keyboard, largely yes — and in more detail. Claude Code's built-in `/context` breaks
context usage down by category (system prompt, tools, MCP, skills, messages) more thoroughly
than this plugin's single context line. If a human reading the terminal is all you need,
reach for `/context`.

But `/context` is a command **you type**: it runs inside Claude Code and prints to your
screen. There is no tool, script, or CLI entry point an *agent* can call to produce it — a
subagent mid-task can't run `/context` and read the result, it would have to ask you to type
it and wait. `/context` also can't show 5h/7d usage, cost, or compaction count at all,
because those reach only the statusline (see [below](#turn-on-live-usage-and-cost)), never
the transcript `/context` reads from.

`ctx-meter` is for the other side of that line. Its report is backed by a plain script
an agent runs and parses as JSON — the programmatic entry point `/context` lacks — and it
carries the usage, cost, and compaction numbers `/context` can't see. **`/context` is for
you; `ctx-meter` is for your agents.**

## Install

Add marketplace:

```
/plugin marketplace add Nicholas-Shore-Chemistry/ctx-meter
```

Install (must be a separate prompt):

```
/plugin install ctx-meter@ctx-meter
```

Set up:

```
/ctx-meter:setup
```

Undo it any time with `/ctx-meter:teardown`. If you have the original `claude-context` plugin
wired, setup refuses to continue: run `/claude-context:teardown` first, then
`/ctx-meter:setup`.

Then any agent — or you — can ask:

```
/ctx-meter:ctx-meter
```

Or:

```
/ctx-meter
```

Reporting requires the one-time `/ctx-meter:setup` (see below). If it hasn't been
run yet, the first `/ctx-meter` runs setup for you (with the same confirm before
touching a statusline it doesn't own) and then reports; it never guesses at numbers it
doesn't have. Once set up, it returns a short human summary **and** a
machine-readable JSON block, so an agent can parse its own resource state directly:

```
ctx-meter — Opus 4.8 (1M context)
Context: 25% used · 245k / 1M tokens · 755k headroom
Session (5h): 9% used · resets in 2h 16m (at 14:30)
Weekly (7d): 2% used · resets in 6d 21h
Cost: $24.94 · Compactions: 0
Source: collector · snapshot 3s old
```

## How your rules read the numbers

The report returns two shapes of the same reading: the human summary above, and the
machine-readable JSON an agent branches on (abbreviated here to the fields rules use — the
full block also carries the token breakdown, `resets_at` timestamps, `model`, and
`session_selection`):

```json
{
  "context":     { "used_percentage": 25, "used_tokens": 245000, "window_size": 1000000, "headroom_tokens": 755000 },
  "rate_limits": {
    "five_hour": { "used_percentage": 9, "resets_in_seconds": 8160 },
    "seven_day": { "used_percentage": 2, "resets_in_seconds": 594000 }
  },
  "cost_usd": 24.94,
  "compactions": 0,
  "source": "collector",
  "rate_limits_status": "available",
  "setup_required": false,
  "snapshot_age_seconds": 3
}
```

An agent doesn't watch these numbers on its own — it reads them only when a rule tells it
to. So a working rule names *when* to check, *which field* to read, and *your* threshold.
Put something like this in your `CLAUDE.md`, a skill, or a subagent prompt:

```markdown
## Resource guardrails

Before starting a new subtask, run `/ctx-meter` and read the JSON block:

- If `context.used_percentage` is above 50, write the current plan and open decisions
  to `PROGRESS.md`, then stop for review.
- Before fanning out subagents, if `rate_limits.five_hour.used_percentage` is above 80,
  summarize progress and pause instead of spawning them.
- If `rate_limits.seven_day.used_percentage` is above 80, stop and tell me first.
- If `setup_required` is true or `rate_limits_status` is not `available`, the number
  isn't live — say so instead of acting on a stale or missing value.
```

The thresholds (50, 80) and the actions are yours; the plugin only supplies the fields —
facts from the tool, policy from you.

## Turn on live usage and cost

Every number in the report — context health included — comes from the collector, so
enable it once:

```
/ctx-meter:setup
```

This wires a small statusline helper — the **collector** — into your Claude Code
settings. (Live 5h/7d usage requires a Pro or Max subscription.)

**Why a statusline, though?** Claude Code sends the live context-window size,
subscription usage, and cost to exactly **one** place: the process that renders your
statusline, over stdin, a few times a second. A slash command or skill run mid-session
— like the report — gets none of that. It can only read the session transcript, which
carries token counts but no usage and no cost. So the only way to see those numbers is
to sit in the statusline slot, record each update to a private per-session snapshot,
and read that snapshot back when the report runs. That snapshot is the entire reason
`/ctx-meter:setup` exists — the collector is not a display, it's a tap.

When the collector owns the slot on its own, it also prints one line: tokens used against
the model window, against the auto-compact window when one is configured, and each
subscription window's usage with the time until it resets:

```
Context 84k/1M 8% · 84k/400k 21% · 5h 50% 1h 49m · 7d 18% 5d 18h
```

### Already have a statusline?

Only one thing can hold the statusline slot, so ctx-meter **co-exists** rather than
evict. `/ctx-meter:setup` first copies your existing statusline command into a private
sidecar file, then puts itself in the slot as a wrapper that runs your original *and* taps
its input for the snapshot. Both run; your **displayed line is unchanged**. Because the
original was saved verbatim, `/ctx-meter:teardown` restores that exact statusline and
removes the sidecar. Setup **never** replaces or takes over a slot it doesn't own.

Other `statusLine` settings such as `refreshInterval` are kept.

Co-existence is available on **macOS, Linux, and Windows + Git Bash** in this alpha. On
**native PowerShell/cmd** ctx-meter does not wire a statusline this release (a change
from 0.2.0, which shipped an empty-slot PowerShell collector) — run Claude Code from **Git
Bash** for live numbers, or wait for a later release.

**What if another statusline plugin later takes over the slot?** ctx-meter fails safe:
your original command is still stored, `/ctx-meter:teardown` refuses to clobber the new
tool and instead shows you the preserved original. ctx-meter stays one level deep — it
co-exists with exactly one prior statusline, not several.

### Platform support and limits

- **macOS / Linux** — fully supported.
- **Windows + Git Bash** — supported, but everything runs through `bash`: the collector
  command *and* any statusline it wraps are executed via `bash -c`, so Git Bash must be on
  your `PATH`, and a foreign statusline is re-spawned under bash rather than your native shell.
- **Native PowerShell / cmd** — setup makes no change this release (see above). Run Claude
  Code from Git Bash for live numbers.
- **How setup tells them apart on Windows** — it asks the Git Bash that Claude Code runs
  (its Bash tool, or `bash.exe` next to `git` / `CLAUDE_CODE_GIT_BASH_PATH`) for
  `$OSTYPE`, whatever the session's primary shell is. `msys`/`cygwin` means setup proceeds,
  even from a PowerShell session. Anything else, including WSL's `bash.exe` (`linux-gnu`)
  or no Git Bash at all, is treated as native PowerShell.
- **File privacy is POSIX-only.** On macOS/Linux the snapshot, the co-existence sidecar, and
  the one-time `settings.json` backup are written owner-only (`0600`). Windows filesystems
  don't honor those mode bits, so on Windows those files are private *by location*, not by OS
  permission — treat a shared Windows machine accordingly.
- **`settings.json` gets normalized.** Setup and teardown rewrite `settings.json` as standard
  2-space JSON. Your original **statusline** is restored verbatim; the surrounding file's own
  indentation and key order are not preserved.

## Every number says how much to trust it

An agent making decisions needs to know when a reading is solid and when it's a
fallback. So every report carries its own provenance: where each number came from
(`source`), whether subscription usage is actually available (`rate_limits_status`),
whether the collector has ever been set up (`setup_required`), and whose session the
numbers belong to (`session_selection`). A missing or stale figure is labeled as
such — never dressed up as a live one — so your rules never fire on a number that
isn't real.

## Whose numbers are these?

The **context** reading is the *session's* — the main agent's context window (what
Claude Code's statusline sees). Subscription **usage (5h/7d)** and **cost** are
*account-wide*, shared across the main agent and every subagent.

So when a subagent asks, it reads the **session's** context, not a private window of
its own. That's usually the signal you want: a subagent can tell whether the
**parent** session is nearing auto-compaction and checkpoint its findings before
that guidance is lost. It is **not** a per-subagent context gauge — a subagent
cannot read its own private context this way.

## Credits

`ctx-meter` adapts battle-tested statusline and transcript-parsing code from
[claude-hud](https://github.com/jarrodwatts/claude-hud) by Jarrod Watts, used under
the MIT License. Thank you.

## Issues

Report problems at <https://github.com/Nicholas-Shore-Chemistry/ctx-meter/issues>.

## License

MIT — see [LICENSE](./LICENSE).
