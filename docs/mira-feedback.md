# Mira AI Track — Feedback & What I Built

> Judging: ① usefulness of feedback ② uniqueness of use case.
> Everything below comes from driving @mira live, not from docs — captured with
> [mira-harness](https://github.com/Masashi-Ono0611/mira-harness) (the submitted tool)
> across ~50 automated probes ([full log](experiments-log.md)).

## What I built

**mira-harness** — a CLI + MCP dev-tool that lets a human *or an AI agent (Claude)*
send a prompt to @mira and capture its full reply (buttons, links, media, edits), then
run a self-driving experiment catalog. The tool itself **is** the integration: it's how
this feedback was generated.

---

## ① Usefulness of feedback

### The headline: developer experience is the biggest gap

As a developer, I had **zero API keys to work with** — and that shaped everything.
**Anything I can't drive from a CLI, or call from an LLM agent (Claude), is very hard
to actually build on.** That gap is the entire reason I had to build mira-harness: a
userbot was the *only* way to interact with Mira programmatically at all.

Minimum I'd want, in order of effort:

1. **A scriptable CLI** (like Supabase's) an agent can drive autonomously — not just a
   chat UI. Today the only "API" is typing into Telegram by hand.
2. **An LLM-facing usage spec** — an `llms.txt` / machine-readable doc — so an agent can
   learn to use Mira (commands, skill activation rules, generation cost gates) **without
   reverse-engineering it**. I had to discover all of §"what worked" below empirically.
3. **A real API / SDK / webhook** eventually (Ethan said "in future") — the proper fix,
   but the two above would unblock most developer use *now*.

> Meta: mira-harness ships its own [`llms.txt`](../llms.txt) precisely to demonstrate #2
> — that's the minimum a dev tool should give an agent. Mira could do the same.

### What worked (surprised me, in a good way)

| Area | Finding |
|---|---|
| Reachability | @mira is fully drivable userbot ⇄ DM, no group needed. |
| Memory | Server-side memory **persists across separate sends / processes** ("favorite token" recalled later). |
| Structured output | Honors **strict-JSON-only** prompts exactly — usable for semi-structured flows. |
| Custom skills | Activation is **permissive** (case-insensitive, separator- and amount-flexible), and a skill can use Mira's **own live web research** (returns a real STON.fi source link). |
| Generation | Image/music are credit-gated behind a **Confirm card with a cost preview** (image 30🪙 / music 60🪙) — pressing ✅ Confirm completes it (~58s, returns a photo). |
| Wallet (testnet) | `/wallet` + NL balance queries work; tx history returns. |
| Integrations | 200+ Composio services; GitHub connect surfaced a real OAuth link. |

### What didn't / surprised me (the other way)

- **Docs are stale on the model.** @mira self-reports **GPT-5 Mini** (images: "GPT Image 2"),
  not the MiniMax M2.5 the deck/track group stated. Treat the model as not-pinned.
- **`/start` payload is ignored.** `t.me/mira?start=<payload>` can't hand context to Mira
  (existing users get no START button), so an **app → Mira** handoff is effectively dead.
  The viable bridge is one-way: **Mira → app** (a skill emits a deep link).
- **Skill output ≠ a Mini App card.** The Swap Helper skill emits a **plain `app.ston.fi`
  URL** (webpage preview), not a Telegram `startapp` "Launch" card as I'd expected.
- **Research is inconsistent / hallucinates.** Across runs I saw "TON rebranded to Gram"
  and "USDT launched 2026." **Surface the source, never auto-execute on it.**
- **Latency is high and variable** — first reply ranged **4.8s – 61.6s**. A naive client
  times out; I had to add a "typing…" grace fallback (extend the deadline while Mira is
  typing). `/wallet` only succeeded because of it.

---

## ② Uniqueness of use case

**An AI autonomously experimenting on another AI, hands-free.** Claude (via the MCP
server) sends probes to @mira, captures the *full* non-text surface most clients drop
(buttons / `web_app`+startapp / `text_url` links / media / streamed edits), paces itself
like a human, stays observe-only behind an allowlist + kill switch, and distills the run
into a reproducible report. The deliverable isn't a product that *calls* Mira — it's a
tool that **studies** Mira and turns the result into exactly this feedback. The same
harness retargets any Telegram bot via a custom catalog, so the "AI probes AI" pattern
generalizes beyond Mira.

---

## Concrete asks (prioritized)

1. **Ship an `llms.txt`** for @mira (commands, skill triggers, generation cost gates,
   wallet scope). Cheapest, highest-leverage for agent builders.
2. **A scriptable CLI** an agent can drive without a userbot workaround.
3. **A read API / webhook**, then a full SDK — the eventual proper integration surface.
