# mira-harness — a CLI + MCP dev-tool for communicating with [@mira](https://t.me/mira)

```text
     *  .  *
    .-------.
    | o   o |     hi — I drive @mira so you don't have to copy-paste its replies.
    |   ~   |     ( I blink ^_^ when doctor passes, and yawn -_- on a timeout. )
    '-------'
```

Drive the **@mira Telegram bot** from a userbot, capture its **full** reply
(buttons, links, media, edits), and run a self-driving experiment catalog — from the
**CLI**, as a **library**, or via **MCP**.

> Built to let an AI agent (Claude) experiment on another AI (@mira) hands-free, and
> to keep a structured, reproducible record of how @mira actually behaves.

**Live:** [masashi-ono0611.github.io/mira-harness](https://masashi-ono0611.github.io/mira-harness/) — landing page + the hosted [`llms.txt`](https://masashi-ono0611.github.io/mira-harness/llms.txt) spec.

## Why a userbot (not a bot)

@mira is **chat-native** — it lives in Telegram chat, with no public API. And
Telegram has a hard rule: **a bot cannot read
another bot's messages**. So a bot token can't talk to @mira. The only working path
is a **userbot** — driving a real Telegram *user account* via MTProto (GramJS).

## Install

Published on [npm](https://www.npmjs.com/package/mira-harness) — run the CLI / MCP via
`npx mira-harness <command>` (or `npm i -g mira-harness`) — runs under Node, no bun
needed. To develop (or use `bun run login`), clone instead; development uses
[bun](https://bun.sh):

```bash
git clone https://github.com/Masashi-Ono0611/mira-harness.git
cd mira-harness
bun install
```

## Configuration

Copy `.env.example` to `.env` and fill in your Telegram `api_id` / `api_hash` — get them at
[my.telegram.org](https://my.telegram.org) → **API development tools** (it's gitignored):

```bash
cp .env.example .env
```

Mint the session once (interactive — enter the code Telegram sends you):

```bash
bun run login          # prints TG_SESSION=... -> paste it into .env
```

(Optional) Mira Pro credits: DM `/promo MIRAFAM26` to @mira.

## Usage

Via `bun run dev -- <args>`, or build once (`bun run build`) and use the `mira-harness` bin / `npx`.

```bash
# one probe — full settled reply as JSON (message via arg or stdin)
bun run dev -- send "What can you do?"
echo "What can you do?" | bun run dev -- send

# self-driving catalog — paced, STOP_MIRA kill switch, observe-only
bun run dev -- loop --category core
bun run dev -- loop --category generation --confirm   # also taps a safe ✅ (spends Pro credits)

# read the results back
bun run dev -- report --out report.md                 # JSONL run log → Markdown
bun run dev -- stats                                  # totals · latency records · 🏆 fastest · sparkline

# no-send commands: preflight, dry-run, live-tail
bun run dev -- doctor
bun run dev -- loop --list
bun run dev -- watch                                  # watch @mira while you poke it by hand
```

Once built (`bun run build`) or installed (`npm i -g mira-harness`), the same commands run as
`mira-harness <command>` — or straight from npm with no clone: `npx mira-harness doctor`.
Every command and flag is in [Commands](#commands); custom catalogs in [Custom catalog](#custom-catalog).

## Capture fidelity (the point)

@mira's interesting behavior lives **outside the plain text**. `send`/`loop` wait a
**settle window** (quiet period after the last activity, bounded by a hard cap, with
a "typing…" fallback for a slow bot — replies run 5–62s) and capture, per message:

- **multi-message** replies and **streamed edits** (final text + an `editCount`),
- **buttons** — inline `url` and **`web_app` / startapp** targets (Mini App "Launch" cards),
- **links** — `text_url` entities (deep-research source links),
- **media** — photo / video / audio / document / webpage (metadata; not downloaded).

`report` turns the JSONL run log into a per-probe Markdown table (gist / signals / latency).

## Commands

| Command | What |
|---|---|
| `login` | One-time interactive login → prints `TG_SESSION` |
| `doctor` | Check `.env` / session / connectivity / @mira resolution (read-only) |
| `send [message...]` | One probe → full reply as JSON (message via arg or stdin). `--quiet --settle --timeout --no-log --expect-*` |
| `loop` | Run the catalog paced; grades `expect` probes (exit 1 on failure). `--category --max --confirm --peer --gap --settle --timeout --list --catalog --grep --only --no-fail --quiet` |
| `catalog` | List the catalog (no sends). `--category --catalog --json` |
| `watch` | Live-tail @mira's messages (observe-only). `--peer` |
| `report` | Distill the run log into Markdown. `--in --out --category` |
| `stats` | At-a-glance dashboard: totals, latency records, sparkline. `--in --category --json` |
| `diff` | Compare two run logs for @mira behavioral drift (exit 1 on a regression). `--json --no-fail` |
| `assert` | Re-grade a saved run log against a catalog's `expect`, offline (exit 1 on failure). `--in --catalog --category --json --no-fail` |
| `schema` | Print the JSON Schema for a custom catalog file (editor autocomplete / validation). `--out` |

Run `mira-harness --help` (or `<command> --help`) for full options.

## Terminal flair

Because waiting on a bot shouldn't be boring:

- **Mascot** greets you on startup, **blinks `^_^`** when `doctor` passes and **`x_x`** when it fails.
- **Rotating tips** under the banner surface a hidden flag each day.
- **Playful spinner** — @mira can take 5–62s, so the wait cycles through verbs ("Summoning…",
  "Consulting the chain…", and a reassuring "Still pondering…" past 30s) next to the elapsed time.
- **Tab-title progress** during `loop` (`mira loop 3/6 · core`) so you can background it.
- **Completion ping** — a terminal notification (OSC 9) when a `loop` finishes.

It never gets in the way: **all decoration goes to stderr** (stdout stays machine-clean for
JSON / Markdown) and only on an interactive TTY. Silence it with `--quiet`, `NO_COLOR`, or
per-feature flags — `MIRA_NO_BANNER=1` (mascot + tip), `MIRA_NO_NOTIFY=1` (completion ping),
`MIRA_NO_TITLE=1` (tab title).

### Custom catalog

The built-in catalog (27 probes: `core` / `skills` / `generation` / `wallet`) is just a
default. Point `--catalog <file.json>` (CLI) or `catalogFile` (MCP) at your own probe set
to probe any bot — each entry needs `id` + `send` (`category` / `hypothesis` / `slow` /
`confirm` / `note` / `expect` optional). See [`examples/catalog.sample.json`](examples/catalog.sample.json):

```bash
mira-harness loop --catalog ./examples/catalog.sample.json
mira-harness catalog --catalog ./examples/catalog.sample.json --json
```

### Assertions (PASS/FAIL)

Give a probe an optional `expect` block and `loop` grades it ✓/✗. The checks are **structural**
— @mira is an LLM (non-deterministic), so exact-text matches would flake:

| Check | Means |
|---|---|
| `replies: true` | a reply arrived (no timeout) |
| `textMatches: "<regex>"` | some message text matches (case-insensitive) |
| `minButtons` / `minLinks` | at least N inline buttons / links across messages |
| `hasWebApp: true` | a Mini App (`web_app` / startapp) "Launch" button is present |
| `media: "photo"` | a message carries media of that kind (`photo`/`video`/`audio`/…) |
| `maxFirstReplyMs` | first-reply latency within the bound |
| `json: true` | the first message text parses as JSON |

```json
{ "id": "json-strict", "send": "Reply with ONLY {\"ok\":true}", "expect": { "json": true } }
```

Probes without `expect` stay observe-only (informational). `loop` **exits non-zero** if any
graded probe fails — so it drops straight into CI. Add `--no-fail` to report without failing.

`assert` re-grades a **saved** run log against the catalog's `expect` (offline, no @mira) — the
fast loop for *developing* assertions (capture once, then tune `expect` and re-grade instantly),
and a way to gate a committed run-log fixture in CI **without a Telegram session**. For a one-off
check, `send` takes inline assertions: `send "What can you do?" --expect-min-links 1 --expect-max-ms 60000`
(any `--expect-*` exits 1 on failure). Run a subset of probes by id with `loop --grep <regex>` or
`loop --only <id1,id2>`; emit a catalog JSON Schema for your editor with `schema`.

### Drift detection

`diff` compares two run logs and flags how @mira's behavior **changed** (structural, not
exact text). **Regressions** — an assertion that flipped ✓→✗, a probe that now times out, a
>2× latency blow-up — exit non-zero; surface changes (buttons / links / media) and
improvements are reported but pass. Snapshot a baseline, re-run later, diff:

```bash
MIRA_RUNS_FILE=baseline.jsonl mira-harness loop --category core   # snapshot a baseline
mira-harness loop --category core                                # a later run -> mira-runs.jsonl
mira-harness diff baseline.jsonl                                 # vs the current run log
```

## Use as a library

The CLI is a thin frontend over an exported core:

```ts
import { connect, sendAndCollect } from "mira-harness";

const client = await connect(process.env.TG_SESSION!);
const result = await sendAndCollect(client, "mira", "What can you do?");
console.log(result.messages[0]?.buttons); // captured buttons (incl. web_app/startapp)
await client.disconnect();
```

Exposed: `connect` · `sendAndCollect` · `clickAndCollect` · `extractMessage` · `CATALOG` /
`probesFor` · `appendRun` · `renderReport` · `tgEnv` (and their types).

## MCP server

A third frontend over the same core: an MCP **stdio** server (`mira-harness-mcp`) so a
Claude/agent can probe @mira directly via tools.

| Tool | Args | What |
|---|---|---|
| `mira_send` | `message`, `settleMs?`, `timeoutMs?` | one probe → full reply (JSON) |
| `mira_loop` | `category?`, `max?`, `peer?`, `gapMs?`, `settleMs?`, `timeoutMs?`, `catalogFile?` | run the catalog, **observe-only** (never clicks / spends credits) |
| `mira_catalog` | `category?`, `catalogFile?` | list the catalog (no network) |
| `mira_report` | `inFile?`, `category?` | run log → Markdown |
| `mira_doctor` | — | env / session / connectivity check |

Register it (local build — run `bun run build` first):

```json
{
  "mcpServers": {
    "mira-harness": {
      "command": "node",
      "args": ["/abs/path/to/mira-harness/dist/mcp.js"],
      "env": {
        "TG_API_ID": "...",
        "TG_API_HASH": "...",
        "TG_SESSION": "...",
        "MIRA_PEER": "mira"
      }
    }
  }
}
```

Credentials come from the `env` block above or a `.env` in the server's working
directory. The bin ships in the published `mira-harness` package, so:
`{ "command": "npx", "args": ["-y", "--package", "mira-harness", "mira-harness-mcp"] }`.

## Safety

- **Allowlist** — sends only to `MIRA_PEER` (+ optional `TG_EXPERIMENT_CHAT`); anything else throws.
- **Kill switch** — `touch STOP_MIRA` blocks all sends (re-checked before a credit-gated confirm too).
- **Observe-only by default** — never clicks. `--confirm` presses only a one-shot **✅ Confirm**
  on `confirm: true` (generation) probes; wallet / OAuth / transfer / "Always yes" are never pressed.
- **Rate** — human-like gap between probes (own-account ban risk).
- **Secrets** — `TG_SESSION` = full account access. `.env` only, never commit.

> Automating a personal account is a Telegram ToS gray area; a ban hits your real
> account. Low frequency + allowlist + kill switch mitigate it. To fully isolate, log
> in with a dedicated test account — no code changes needed.

## Docs

- [Live site](https://masashi-ono0611.github.io/mira-harness/) — the project landing page, with the hosted [`llms.txt`](https://masashi-ono0611.github.io/mira-harness/llms.txt) spec.
- [`docs/`](docs/) — hackathon submission, Mira AI Track feedback, and the full experiment log.
- [`docs/mira-chat-history.txt`](docs/mira-chat-history.txt) — raw @mira chat transcript (101 messages), exported via the userbot (read-only).
- [`llms.txt`](llms.txt) — LLM-facing spec so an agent can drive this tool without reverse-engineering it.

## Develop

Development uses [bun](https://bun.sh) (≥ 1.3); the published package stays Node-compatible.

```bash
bun install
bun run dev -- doctor   # run the CLI straight from source
bun run lint            # biome check (lint + format) · `bun run format` to auto-fix
bun run typecheck       # tsc --noEmit
bun test                # bun:test unit tests (no network)
bun run build           # bun build -> dist (+ tsc declarations)
bun run check:publish   # publint + attw — validate the package & type resolution
bun run slop            # advisory AI-slop scan (never fails)
```

## License

MIT
