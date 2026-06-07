# mira-harness

**Automated probe harness for the [@mira](https://t.me/mira) Telegram bot.**

Drive @mira from a Telegram *userbot* (GramJS), capture the **full** reply — buttons,
deep-link / `startapp` targets, source links, media, edits, latency — and run a
self-driving experiment catalog. No screenshots, no copy-paste.

> Built to let an AI agent (Claude) experiment on another AI (@mira) hands-free, and
> to keep a structured, reproducible record of how @mira actually behaves.

## Why a userbot (not a bot)

@mira has **no public API**, and Telegram has a hard rule: **a bot cannot read
another bot's messages**. So a bot token can't talk to @mira. The only working path
is a **userbot** — driving a real Telegram *user account* via MTProto (GramJS).

## Install

```bash
git clone https://github.com/Masashi-Ono0611/mira-harness.git
cd mira-harness
npm install
```

## Configuration

Copy `.env.example` to `.env` and fill in your Telegram `api_id` / `api_hash` (it's gitignored):

```bash
cp .env.example .env
```

Mint the session once (interactive — enter the code Telegram sends you):

```bash
npm run login          # prints TG_SESSION=... -> paste it into .env
```

(Optional) Mira Pro credits: DM `/promo MIRAFAM26` to @mira.

## Usage

Via `npm run dev -- <args>`, or build once (`npm run build`) and use the `mira-harness` bin / `npx`.

```bash
# one probe — prints the full settled reply as JSON
npm run dev -- send "STON_USDT_10"

# self-driving catalog (paced 15s, STOP_MIRA kill switch, observe-only)
npm run dev -- loop --category core
npm run dev -- loop --category skills --max 4

# also press a safe ✅ Confirm on generation probes (spends Pro credits)
npm run dev -- loop --category generation --confirm

# run in a group instead of the DM (needs TG_EXPERIMENT_CHAT)
npm run dev -- loop --peer experiment

# distill the run log into Markdown
npm run dev -- report
npm run dev -- report --out report.md
```

After `npm run build`:

```bash
npx mira-harness send "ping"
npx mira-harness loop --category core
```

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
| `send <message...>` | One probe → full reply as JSON + append to run log |
| `loop [--category] [--max] [--confirm] [--peer]` | Run the catalog (`src/catalog.ts`) paced |
| `report [--in] [--out]` | Distill the run log into Markdown |

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

## Develop

```bash
npm run typecheck   # tsc --noEmit
npm test            # unit tests for the pure extractors (no network)
npm run build       # tsup -> dist/cli.js
```

## License

MIT
