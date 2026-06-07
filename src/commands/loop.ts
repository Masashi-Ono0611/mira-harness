/**
 * Self-driving probe runner: walk the experiment catalog, send each probe to
 * @mira at a human-like pace, capture the full reply, and append it to the run log.
 *
 *   mira-harness loop                          # up to --max probes from the catalog
 *   mira-harness loop --category core
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
import { CATEGORIES, probesFor, type Probe } from "../catalog.js";

const STOP_FILE = "STOP_MIRA";
const GAP_MS = 15_000;
const SLOW: CollectOptions = { firstReplyTimeoutMs: 90_000, maxMs: 240_000, typingGraceMs: 90_000 };

/** A button we'll press is a one-shot "Confirm"; never "Always yes" or anything risky. */
const CONFIRM_RE = /confirm|generate|✅/i;
const UNSAFE_RE = /wallet|swap|send|transfer|connect|o?auth|authorize|withdraw|\bpay\b|always/i;

type Confirmable = { msgId: number; data: Buffer; label: string };

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** Find a safe one-shot Confirm callback button in a result, or undefined. */
function findConfirmButton(result: Awaited<ReturnType<typeof sendAndCollect>>): Confirmable | undefined {
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

/** Compact one-line summary of a probe result for stdout. */
function summarize(p: Probe, r: Awaited<ReturnType<typeof sendAndCollect>>): string {
  const btns = r.messages.reduce((n, m) => n + m.buttons.length, 0);
  const links = r.messages.reduce((n, m) => n + m.links.length, 0);
  const media = r.messages.filter((m) => m.media).map((m) => m.media?.kind).join(",");
  return [
    p.id,
    r.timedOut ? "TIMEOUT" : `${r.messages.length}msg`,
    `${r.firstReplyMs ?? "-"}ms`,
    btns ? `${btns}btn` : "",
    links ? `${links}link` : "",
    media ? `media=${media}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface LoopOptions {
  category?: string;
  max: number;
  confirm: boolean;
  peer?: string;
}

export async function loop(opts: LoopOptions): Promise<void> {
  if (opts.category && !CATEGORIES.includes(opts.category as (typeof CATEGORIES)[number])) {
    console.error(`unknown --category "${opts.category}" (one of: ${CATEGORIES.join(", ")})`);
    process.exit(1);
  }

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

  const probes = probesFor(opts.category).slice(0, opts.max);
  if (!probes.length) {
    console.error("no probes selected.");
    process.exit(1);
  }
  console.error(
    `running ${probes.length} probe(s)${opts.category ? ` [${opts.category}]` : ""} -> ${peer}` +
      `, gap ${GAP_MS / 1000}s${opts.confirm ? ", --confirm ON" : ""}`,
  );

  const client = await connect(session);
  let ran = 0;
  try {
    for (let i = 0; i < probes.length; i++) {
      if (existsSync(STOP_FILE)) {
        console.error(`${STOP_FILE} present — stopping (ran ${ran}/${probes.length}).`);
        break;
      }
      const p = probes[i];
      const result = await sendAndCollect(client, peer, p.send, p.slow ? SLOW : {});
      await appendRun(result, { probeId: p.id, category: p.category, hypothesis: p.hypothesis });
      ran += 1;
      console.log(summarize(p, result));

      // Interaction (opt-in): press a safe Confirm to complete a credit-gated probe.
      if (opts.confirm && p.confirm) {
        const c = findConfirmButton(result);
        if (c && existsSync(STOP_FILE)) {
          console.error(`  ↳ ${STOP_FILE} present — skipping the credit-gated confirm for ${p.id}.`);
        } else if (c) {
          console.error(`  ↳ pressing "${c.label}" on msg ${c.msgId} …`);
          const after = await clickAndCollect(client, peer, c.msgId, c.data, SLOW);
          await appendRun(after, {
            probeId: `${p.id}-confirmed`,
            category: p.category,
            hypothesis: `press "${c.label}" -> result`,
          });
          console.log(summarize({ ...p, id: `${p.id}-confirmed` }, after));
        } else {
          console.error(`  ↳ --confirm set but no safe Confirm button found for ${p.id}`);
        }
      }
      if (i < probes.length - 1) await sleep(GAP_MS);
    }
  } finally {
    await client.disconnect();
  }
  console.error(`done — ${ran} probe(s) logged.`);
}
