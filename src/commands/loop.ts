/**
 * Self-driving probe runner: walk the experiment catalog, send each probe to
 * @mira at a human-like pace, capture the full reply, and append it to the run log.
 *
 *   mira-harness loop                          # up to --max probes from the catalog
 *   mira-harness loop --category core
 *   mira-harness loop --list                   # just list what would run
 *   mira-harness loop --category generation --confirm   # also press ✅ Confirm (spends credits)
 *   mira-harness loop --peer experiment        # run in TG_EXPERIMENT_CHAT instead of the DM
 *
 * Guards:
 *  - STOP_MIRA file present -> stop before the next send (kill switch); also
 *    re-checked right before a credit-gated confirm.
 *  - gap (default 15s) between sends + per-invocation --max (default 6).
 *  - Observe-only by DEFAULT. `--confirm` presses ONLY a "✅ Confirm" callback on
 *    probes flagged `confirm: true` (generation), never wallet/OAuth.
 */
import { existsSync } from "node:fs";
import { tgEnv } from "../env.js";
import { connect, sendAndCollect, clickAndCollect, type CollectOptions } from "../client.js";
import { appendRun } from "../log.js";
import { CATALOG, CATEGORIES, loadCatalog, probesFor, type Probe } from "../catalog.js";
import { c, note, withProgress } from "../ui.js";
import { listCatalog } from "./catalog.js";

const STOP_FILE = "STOP_MIRA";
const DEFAULT_GAP_MS = 15_000;
const SLOW: CollectOptions = { firstReplyTimeoutMs: 90_000, maxMs: 240_000, typingGraceMs: 90_000 };

/** A button we'll press is a one-shot "Confirm"; never "Always yes" or anything risky. */
const CONFIRM_RE = /confirm|generate|✅/i;
const UNSAFE_RE = /wallet|swap|send|transfer|connect|o?auth|authorize|withdraw|\bpay\b|always/i;

type Confirmable = { msgId: number; data: Buffer; label: string };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Find a safe one-shot Confirm callback button in a result, or undefined. (Exported for tests.) */
export function findConfirmButton(result: Awaited<ReturnType<typeof sendAndCollect>>): Confirmable | undefined {
  for (const m of result.messages) {
    if (UNSAFE_RE.test(m.text)) continue; // skip wallet/OAuth/transfer contexts entirely
    for (const b of m.buttons) {
      if (!b.callbackData || UNSAFE_RE.test(b.text)) continue;
      if (CONFIRM_RE.test(b.text)) {
        return { msgId: m.id, data: Buffer.from(b.callbackData, "base64"), label: b.text };
      }
    }
  }
  return undefined;
}

/** Colored one-line summary of a probe result. */
function summarize(id: string, r: Awaited<ReturnType<typeof sendAndCollect>>): string {
  const btns = r.messages.reduce((n, m) => n + m.buttons.length, 0);
  const links = r.messages.reduce((n, m) => n + m.links.length, 0);
  const media = r.messages.filter((m) => m.media).map((m) => m.media?.kind).join(",");
  const head = r.timedOut ? c.yellow("TIMEOUT") : c.green(`${r.messages.length}msg`);
  const latency = r.firstReplyMs === null ? c.dim("—") : c.dim(`${(r.firstReplyMs / 1000).toFixed(1)}s`);
  const parts = [
    c.cyan(id),
    head,
    latency,
    btns ? `${btns}btn` : "",
    links ? `${links}link` : "",
    media ? c.magenta(`media=${media}`) : "",
  ].filter(Boolean);
  return parts.join(" ");
}

export interface LoopOptions {
  category?: string;
  max: number;
  confirm: boolean;
  peer?: string;
  gap?: number;
  settle?: number;
  timeout?: number;
  list?: boolean;
  quiet?: boolean;
  /** Custom catalog file (JSON); falls back to the built-in CATALOG. */
  catalog?: string;
}

function collectFor(p: Probe, opts: LoopOptions): CollectOptions {
  const base: CollectOptions = p.slow ? { ...SLOW } : {};
  if (opts.settle !== undefined) base.settleMs = opts.settle;
  if (opts.timeout !== undefined) base.firstReplyTimeoutMs = opts.timeout;
  return base;
}

export async function loop(opts: LoopOptions): Promise<void> {
  // Validate against built-in categories only when using the built-in catalog.
  if (!opts.catalog && opts.category && !CATEGORIES.includes(opts.category as (typeof CATEGORIES)[number])) {
    console.error(`unknown --category "${opts.category}" (one of: ${CATEGORIES.join(", ")})`);
    process.exit(1);
  }

  if (opts.list) {
    listCatalog({ category: opts.category, max: opts.max, catalog: opts.catalog }); // honor --max + custom catalog
    return;
  }

  const source = opts.catalog ? loadCatalog(opts.catalog) : CATALOG;

  // Target the @mira DM by default; `--peer experiment|group` uses TG_EXPERIMENT_CHAT.
  let peer = tgEnv.miraPeer;
  if (opts.peer === "experiment" || opts.peer === "group") {
    if (!tgEnv.experimentChat) {
      console.error("--peer experiment requires TG_EXPERIMENT_CHAT in .env (a group chat with @mira).");
      process.exit(1);
    }
    peer = tgEnv.experimentChat;
  } else if (opts.peer) {
    peer = opts.peer; // a literal peer — assertAllowed rejects anything not allowlisted
  }

  const session = tgEnv.session();
  if (!session) {
    console.error("TG_SESSION is empty — run `mira-harness login` first, then put it in .env.");
    process.exit(1);
  }

  const probes = probesFor(opts.category, source).slice(0, opts.max);
  if (!probes.length) {
    console.error("no probes selected.");
    process.exit(1);
  }
  const gap = opts.gap ?? DEFAULT_GAP_MS;
  note(
    c.bold(
      `running ${probes.length} probe(s)${opts.category ? ` [${opts.category}]` : ""} -> @${peer}` +
        c.dim(`  gap ${gap / 1000}s${opts.confirm ? "  --confirm ON" : ""}`),
    ),
  );

  const client = await connect(session);
  let ran = 0;
  try {
    for (let i = 0; i < probes.length; i++) {
      if (existsSync(STOP_FILE)) {
        note(c.yellow(`${STOP_FILE} present — stopping (ran ${ran}/${probes.length}).`));
        break;
      }
      const p = probes[i];
      const result = await withProgress(
        `${p.id} -> @${peer}`,
        () => sendAndCollect(client, peer, p.send, collectFor(p, opts)),
        opts.quiet,
      );
      await appendRun(result, { probeId: p.id, category: p.category, hypothesis: p.hypothesis });
      ran += 1;
      console.log(summarize(p.id, result));

      // Interaction (opt-in): press a safe Confirm to complete a credit-gated probe.
      if (opts.confirm && p.confirm) {
        const found = findConfirmButton(result);
        if (found && existsSync(STOP_FILE)) {
          note(c.yellow(`  ↳ ${STOP_FILE} present — skipping the credit-gated confirm for ${p.id}.`));
        } else if (found) {
          note(c.dim(`  ↳ pressing "${found.label}" on msg ${found.msgId} …`));
          const after = await withProgress(
            `${p.id} confirm`,
            () => clickAndCollect(client, peer, found.msgId, found.data, collectFor(p, opts)),
            opts.quiet,
          );
          await appendRun(after, {
            probeId: `${p.id}-confirmed`,
            category: p.category,
            hypothesis: `press "${found.label}" -> result`,
          });
          console.log(summarize(`${p.id}-confirmed`, after));
        } else {
          note(c.dim(`  ↳ --confirm set but no safe Confirm button found for ${p.id}`));
        }
      }
      if (i < probes.length - 1) await sleep(gap);
    }
  } finally {
    await client.disconnect();
  }
  note(c.green(`done — ${ran} probe(s) logged.`));
}
