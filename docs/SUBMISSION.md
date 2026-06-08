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
A CLI + MCP dev-tool for experimenting on @mira.
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
- GramJS / MTProto userbot — the only programmatic path to @mira (it has no public API, and a bot can't read another bot).
```

## 説明 (description)

```
mira-harness is a developer tool for experimenting on @mira, the Telegram AI teammate. @mira has no public API, and Telegram forbids a bot from reading another bot's messages — so the only programmatic path is a userbot (a real user account over MTProto). mira-harness wraps that into a clean CLI, a TypeScript library, and an MCP server, so a human or an AI agent (Claude) can send a prompt to @mira and capture its full reply: not just the text, but buttons (incl. web_app / startapp), links, media, and streamed edits.

On top of that it runs a self-driving experiment catalog — 30 probes across model/memory, skills, generation, and wallet — paced like a human, observe-only by default (an allowlist + a STOP_MIRA kill switch keep it from clicking wallet/OAuth or spending credits), and distills each run into a Markdown report. The unique angle: one AI (Claude, via the MCP server) autonomously experiments on another AI (@mira), hands-free, and produces a reproducible record of how @mira actually behaves — which is exactly the Mira AI Track feedback (see docs/mira-feedback.md).
```

## Links

```
GitHub:      https://github.com/Masashi-Ono0611/mira-harness
npm:         https://www.npmjs.com/package/mira-harness
Try it:      npx mira-harness doctor
Feedback:    https://github.com/Masashi-Ono0611/mira-harness/blob/main/docs/mira-feedback.md
Experiments: https://github.com/Masashi-Ono0611/mira-harness/blob/main/docs/experiments-log.md
```

## Mira AI Track checklist

The track asks for three things:

| Required | Where |
|---|---|
| ① Export your @mira chat history | (attach the Telegram "Export chat history" file) |
| ② Tell us what you built | the description above + the repo README |
| ③ Share your feedback | [`docs/mira-feedback.md`](mira-feedback.md), backed by [`docs/experiments-log.md`](experiments-log.md) |

Judging is ① usefulness of feedback ② uniqueness of use case — both are addressed in the feedback doc.
