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
import { evaluate, type Verdict } from "../assert.js";
import { CATALOG, CATEGORIES, grepProbes, loadCatalog, onlyProbes, type Probe, probesFor } from "../catalog.js";
import { type CollectOptions, clickAndCollect, connect, sendAndCollect } from "../client.js";
import { tgEnv } from "../env.js";
import { appendRun } from "../log.js";
import { c, clearTitle, note, notify, setTitle, withProgress } from "../ui.js";
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

/** Colored one-line summary of a probe result. A graded probe is prefixed ✓/✗. */
function summarize(id: string, r: Awaited<ReturnType<typeof sendAndCollect>>, verdict?: Verdict): string {
  const btns = r.messages.reduce((n, m) => n + m.buttons.length, 0);
  const links = r.messages.reduce((n, m) => n + m.links.length, 0);
  const media = r.messages
    .filter((m) => m.media)
    .map((m) => m.media?.kind)
    .join(",");
  const head = r.timedOut ? c.yellow("TIMEOUT") : c.green(`${r.messages.length}msg`);
  const latency = r.firstReplyMs === null ? c.dim("—") : c.dim(`${(r.firstReplyMs / 1000).toFixed(1)}s`);
  const mark = verdict ? (verdict.ok ? c.green("✓") : c.red("✗")) : c.dim("·");
  const parts = [
    mark,
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
  /** Do not exit non-zero even if a graded probe fails its assertions. */
  noFail?: boolean;
  /** Run only probes whose id matches this regex (case-insensitive). */
  grep?: string;
  /** Run only probes whose id is in this comma-separated list (exact match). */
  only?: string;
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
    listCatalog({ category: opts.category, max: opts.max, catalog: opts.catalog, grep: opts.grep, only: opts.only }); // honor --max/--grep/--only + custom catalog
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

  let matched = probesFor(opts.category, source);
  if (opts.grep) matched = grepProbes(matched, opts.grep);
  if (opts.only) matched = onlyProbes(matched, opts.only);
  const probes = matched.slice(0, opts.max);
  if (!probes.length) {
    const why = opts.only ? `--only "${opts.only}"` : opts.grep ? `--grep "${opts.grep}"` : undefined;
    console.error(why ? `no probes match ${why}.` : "no probes selected.");
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
  let graded = 0;
  let failed = 0;
  try {
    for (const [i, p] of probes.entries()) {
      if (existsSync(STOP_FILE)) {
        note(c.yellow(`${STOP_FILE} present — stopping (ran ${ran}/${probes.length}).`));
        break;
      }
      if (!opts.quiet) setTitle(`mira loop ${i + 1}/${probes.length} · ${p.category}`);
      const result = await withProgress(
        `${p.id} -> @${peer}`,
        () => sendAndCollect(client, peer, p.send, collectFor(p, opts)),
        opts.quiet,
      );
      const verdict = p.expect ? evaluate(p.expect, result) : undefined;
      await appendRun(result, {
        probeId: p.id,
        category: p.category,
        hypothesis: p.hypothesis,
        ...(verdict ? { assert: verdict } : {}),
      });
      ran += 1;
      if (verdict) {
        graded += 1;
        if (!verdict.ok) failed += 1;
      }
      console.log(summarize(p.id, result, verdict));
      if (verdict && !verdict.ok) {
        for (const ch of verdict.checks.filter((x) => !x.ok)) {
          note(c.dim(`    ✗ ${ch.name}: ${ch.detail}`));
        }
      }

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
    clearTitle();
    await client.disconnect();
  }
  note(
    c.green(`done — ${ran} probe(s) logged.`) +
      (graded ? c.dim(`  ·  ${graded - failed}/${graded} assertions passed`) : ""),
  );
  notify(`mira loop done — ${ran} probe(s) logged`, { quiet: opts.quiet });
  if (failed > 0 && !opts.noFail) {
    note(c.red(`${failed} probe(s) failed their assertions.`));
    process.exit(1);
  }
}
