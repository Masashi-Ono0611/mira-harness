# Hackathon Submission — mira-harness

STON.fi Vibe Coding Hackathon R2 · **Mira AI Track** (Best project integrating Mira).
Copy-paste values are in code blocks; the prose under each is context, not for the form.

---

## Project name

```
mira-harness
```

## One-liner

```
A CLI + MCP dev-tool for communicating with @mira.
```

## Blurb

```
Drive the @mira Telegram bot from a userbot, capture its full reply (buttons, links, media, edits), and run a self-driving experiment catalog — from the CLI, as a library, or via MCP.
```

## AI tools & integrations

```
- Claude Code (Opus) — the autonomous agent that built mira-harness and drives @mira live through its MCP server.
- @mira — the Telegram AI teammate; the subject of every experiment, and a pair programmer during the build.
- Model Context Protocol (MCP) — mira-harness ships an MCP stdio server (5 tools) so any agent can probe @mira directly.
- GramJS / MTProto userbot — the only programmatic path to @mira (it's chat-native — no public API — and a bot can't read another bot).
```

## Description

```
mira-harness is a developer tool for communicating with @mira, the Telegram AI teammate. @mira is chat-native (no public API) and a bot can't read another bot, so the only programmatic path is a userbot (a real account over MTProto). mira-harness wraps that into a CLI, a TypeScript library, and an MCP server, so a human or an AI agent (Claude) can prompt @mira and capture its full reply: text, buttons (incl. web_app / startapp), links, media, and streamed edits.

It also runs a self-driving catalog of 30 probes (model/memory, skills, generation, wallet), human-paced and observe-only by default (an allowlist + STOP_MIRA kill switch block wallet/OAuth clicks and credit spend), distilled into a Markdown report. The angle: one AI (Claude, via MCP) experiments on another (@mira) hands-free, producing a reproducible record of how @mira behaves — exactly the Mira AI Track feedback (docs/mira-feedback.md).
```

## Links

```
GitHub:      https://github.com/Masashi-Ono0611/mira-harness
npm:         https://www.npmjs.com/package/mira-harness
Try it:      npx mira-harness doctor
Feedback:    https://github.com/Masashi-Ono0611/mira-harness/blob/main/docs/mira-feedback.md
Experiments: https://github.com/Masashi-Ono0611/mira-harness/blob/main/docs/experiments-log.md
llms.txt:    https://github.com/Masashi-Ono0611/mira-harness/blob/main/llms.txt
```

## How Did You Use Mira?

```
Two ways. (1) @mira is the subject of the project: mira-harness drives @mira from a userbot — the only programmatic path, since @mira has no public API and Telegram won't let a bot read another bot — and lets Claude autonomously run ~50 probes across model/memory, skills, generation, and wallet, capturing each full reply (buttons incl. web_app / startapp, links, media, streamed edits) into a reproducible Markdown log. (2) @mira was also a build-time teammate — I used it to sanity-check TON / STON.fi specifics while building. So one AI (Claude, via the MCP server) experiments on another AI (@mira) hands-free, and the tool itself is the integration: it's how the feedback below was generated. Full log: docs/experiments-log.md.
```

## Challenges & Feedback

```
Biggest challenge: zero API keys, and @mira has no public API / SDK / CLI — so the only programmatic path was a userbot (a real account over MTProto). That workaround is why mira-harness exists. Other friction, all found driving @mira live:
- Latency is high and variable (4.8s–61.6s); naive clients time out, so I added a "typing…" grace fallback.
- /start payloads are ignored — an app → Mira handoff is dead; only Mira → app deep links work.
- Skill output is a plain app.ston.fi URL, not a Telegram startapp "Launch" card.
- Web research can hallucinate ("TON rebranded to Gram", "USDT launched 2026") — surface the source, never auto-execute.
- The model isn't pinned: @mira self-reports GPT-5 Mini, not the MiniMax M2.5 the deck stated.

Top asks: (1) an llms.txt for @mira (commands, skill triggers, cost gates, wallet scope) — cheapest, highest-leverage; (2) a scriptable CLI; (3) a read API / webhook, then a full SDK. Full writeup: docs/mira-feedback.md.
```

## Mira AI Track checklist

The track asks for three things:

| Required | Where |
|---|---|
| ① Export your @mira chat history | [`docs/mira-chat-history.txt`](mira-chat-history.txt) (userbot export); also attach Telegram's native "Export chat history" file |
| ② Tell us what you built | the description above + the repo README |
| ③ Share your feedback | [`docs/mira-feedback.md`](mira-feedback.md), backed by [`docs/experiments-log.md`](experiments-log.md) |

Judging is ① usefulness of feedback ② uniqueness of use case — both are addressed in the feedback doc.
