#!/usr/bin/env node
/**
 * mira-harness MCP server (stdio) — a third frontend over the same core as the CLI.
 *
 * Lets a Claude/agent probe @mira directly via tools: mira_send, mira_loop,
 * mira_catalog, mira_report, mira_doctor.
 *
 * Register (local, unbuilt path):
 *   { "mcpServers": { "mira-harness": { "command": "node", "args": ["<abs>/dist/mcp.js"] } } }
 *
 * CRITICAL: stdout carries the JSON-RPC stream, so NOTHING here writes to stdout.
 * All diagnostics go to stderr; GramJS logs are already silenced (baseLogger=NONE).
 */
import { existsSync } from "node:fs";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { CATALOG, CATEGORIES, loadCatalog, type Probe, probesFor } from "./catalog.js";
import { type CollectOptions, connect, resolvePeer, sendAndCollect } from "./client.js";
import { renderReport } from "./commands/report.js";
import { tgEnv } from "./env.js";
import { appendRun } from "./log.js";
import { getVersion } from "./version.js";

const STOP_FILE = "STOP_MIRA";
const DEFAULT_GAP_MS = 15_000;
const SLOW: CollectOptions = { firstReplyTimeoutMs: 90_000, maxMs: 240_000, typingGraceMs: 90_000 };

type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };
const text = (s: string): ToolResult => ({ content: [{ type: "text" as const, text: s }] });
const json = (o: unknown): ToolResult => text(JSON.stringify(o, null, 2));
const errorText = (s: string): ToolResult => ({ content: [{ type: "text" as const, text: s }], isError: true });
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Connect with the session from env, run fn, always disconnect. */
async function withClient<T>(fn: (client: Awaited<ReturnType<typeof connect>>) => Promise<T>): Promise<T> {
  const session = tgEnv.session();
  if (!session) throw new Error("TG_SESSION is empty — run `mira-harness login` and set it (env or .env).");
  const client = await connect(session);
  try {
    return await fn(client);
  } finally {
    await client.disconnect();
  }
}

function collectFor(p: Probe, settleMs?: number, timeoutMs?: number): CollectOptions {
  const base: CollectOptions = p.slow ? { ...SLOW } : {};
  if (settleMs !== undefined) base.settleMs = settleMs;
  if (timeoutMs !== undefined) base.firstReplyTimeoutMs = timeoutMs;
  return base;
}

function validCategory(category: string | undefined): boolean {
  return !category || (CATEGORIES as readonly string[]).includes(category);
}

// NOTE: object-schema tools require the client to send an `arguments` object
// (even `{}`). Spec-compliant clients including Claude always do; the SDK rejects
// a fully-omitted `arguments` for an object schema. `mira_doctor` has no schema so
// it accepts no-arg calls directly.
const server = new McpServer({ name: "mira-harness", version: getVersion() });

server.registerTool(
  "mira_send",
  {
    title: "Send one probe to @mira",
    description:
      "Send a message to @mira and capture the FULL settled reply (messages, buttons incl. web_app/startapp, links, media, edits, latency).",
    inputSchema: {
      message: z.string().describe("the message to send to @mira"),
      settleMs: z.number().int().positive().optional().describe("quiet window before concluding"),
      timeoutMs: z.number().int().positive().optional().describe("give up if no reply by then"),
    },
  },
  async ({ message, settleMs, timeoutMs }) => {
    if (existsSync(STOP_FILE)) return errorText(`${STOP_FILE} present — kill switch active, aborting.`);
    const collect: CollectOptions = {};
    if (settleMs !== undefined) collect.settleMs = settleMs;
    if (timeoutMs !== undefined) collect.firstReplyTimeoutMs = timeoutMs;
    try {
      const result = await withClient((c) => sendAndCollect(c, tgEnv.miraPeer, message, collect));
      await appendRun(result);
      return json(result);
    } catch (e) {
      return errorText(msg(e));
    }
  },
);

server.registerTool(
  "mira_loop",
  {
    title: "Run the experiment catalog (observe-only)",
    description:
      "Send catalog probes to @mira at a human pace and capture replies. OBSERVE-ONLY: never presses buttons or spends credits (use the CLI `loop --confirm` for that).",
    inputSchema: {
      category: z
        .string()
        .optional()
        .describe(`one of: ${CATEGORIES.join(", ")} (or any category in a custom catalog)`),
      max: z.number().int().positive().max(50).optional().describe("max probes (default 6)"),
      peer: z
        .string()
        .optional()
        .describe("'experiment'|'group' for TG_EXPERIMENT_CHAT, or a literal allowlisted peer"),
      gapMs: z.number().int().nonnegative().optional().describe("delay between sends (default 15000)"),
      settleMs: z.number().int().positive().optional(),
      timeoutMs: z.number().int().positive().optional(),
      catalogFile: z.string().optional().describe("custom catalog JSON file (instead of the built-in catalog)"),
    },
  },
  async ({ category, max, peer, gapMs, settleMs, timeoutMs, catalogFile }) => {
    let source: Probe[];
    try {
      source = catalogFile ? loadCatalog(catalogFile) : CATALOG;
    } catch (e) {
      return errorText(msg(e));
    }
    if (!catalogFile && !validCategory(category)) {
      return errorText(`unknown category "${category}" (one of: ${CATEGORIES.join(", ")})`);
    }
    let target = tgEnv.miraPeer;
    if (peer === "experiment" || peer === "group") {
      if (!tgEnv.experimentChat) return errorText("peer 'experiment' requires TG_EXPERIMENT_CHAT in env.");
      target = tgEnv.experimentChat;
    } else if (peer) {
      target = peer;
    }
    const probes = probesFor(category, source).slice(0, max ?? 6);
    if (!probes.length) return errorText("no probes selected.");
    const gap = gapMs ?? DEFAULT_GAP_MS;
    const results: unknown[] = [];
    try {
      let stopped = false;
      await withClient(async (client) => {
        for (const [i, p] of probes.entries()) {
          if (existsSync(STOP_FILE)) {
            stopped = true;
            break;
          }
          const r = await sendAndCollect(client, target, p.send, collectFor(p, settleMs, timeoutMs));
          await appendRun(r, { probeId: p.id, category: p.category, hypothesis: p.hypothesis });
          results.push({
            probeId: p.id,
            category: p.category,
            timedOut: r.timedOut,
            firstReplyMs: r.firstReplyMs,
            messages: r.messages,
          });
          if (i < probes.length - 1) await sleep(gap);
        }
      });
      return json({ ran: results.length, stopped, peer: target, results });
    } catch (e) {
      return errorText(msg(e));
    }
  },
);

server.registerTool(
  "mira_catalog",
  {
    title: "List the experiment catalog",
    description: "List probes (id, category, hypothesis, flags) without sending anything.",
    inputSchema: {
      category: z
        .string()
        .optional()
        .describe(`one of: ${CATEGORIES.join(", ")} (or any category in a custom catalog)`),
      catalogFile: z.string().optional().describe("custom catalog JSON file (instead of the built-in catalog)"),
    },
  },
  async ({ category, catalogFile }) => {
    let source: Probe[];
    try {
      source = catalogFile ? loadCatalog(catalogFile) : CATALOG;
    } catch (e) {
      return errorText(msg(e));
    }
    if (!catalogFile && !validCategory(category)) {
      return errorText(`unknown category "${category}" (one of: ${CATEGORIES.join(", ")})`);
    }
    const probes = probesFor(category, source).map((p) => ({
      id: p.id,
      category: p.category,
      hypothesis: p.hypothesis,
      send: p.send,
      slow: Boolean(p.slow),
      confirm: Boolean(p.confirm),
    }));
    return json(probes);
  },
);

server.registerTool(
  "mira_report",
  {
    title: "Render the run log as Markdown",
    description: "Distill the JSONL run log into a Markdown report (per-probe gist / signals / latency).",
    inputSchema: {
      inFile: z.string().optional().describe("input JSONL path (default: the run log)"),
      category: z.string().optional().describe("only include probes from this category"),
    },
  },
  async ({ inFile, category }) => {
    try {
      return text(renderReport(inFile, category));
    } catch (e) {
      return errorText(msg(e));
    }
  },
);

server.registerTool(
  "mira_doctor",
  {
    title: "Preflight checks",
    description: "Check env, session, connectivity and @mira resolution (read-only — sends nothing).",
    // No inputSchema: an EMPTY object shape ({}) makes the SDK reject no-argument
    // calls with -32602 (it validates `undefined` against an object). Omitting it
    // lets `mira_doctor` be called with no arguments.
  },
  async () => {
    const lines: string[] = [];
    try {
      tgEnv.apiId();
      tgEnv.apiHash();
      lines.push("✔ TG_API_ID / TG_API_HASH present");
    } catch (e) {
      lines.push(`✗ ${msg(e)}`);
      return text(lines.join("\n"));
    }
    if (!tgEnv.session()) {
      lines.push("✗ TG_SESSION is empty — run `mira-harness login`");
      return text(lines.join("\n"));
    }
    lines.push("✔ TG_SESSION present");
    try {
      await withClient(async (client) => {
        const me = (await client.getMe()) as { username?: string; id?: { toString(): string } };
        lines.push(`✔ connected as @${me.username ?? "?"} (id ${me.id?.toString() ?? "?"})`);
        const mira = (await resolvePeer(client, tgEnv.miraPeer)) as { id?: { toString(): string } };
        lines.push(`✔ resolved @${tgEnv.miraPeer} (id ${mira.id?.toString() ?? "?"})`);
      });
    } catch (e) {
      lines.push(`✗ ${msg(e)}`);
    }
    return text(lines.join("\n"));
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
process.stderr.write(`mira-harness MCP server ready (v${getVersion()})\n`);
