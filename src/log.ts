/**
 * Append-only structured run log (the machine source of truth).
 *
 * Each probe -> one JSON line. `mira-harness report` distills it into Markdown.
 * A ProbeResult only holds the peer name, what we sent, and the bot's reply —
 * never the session/secrets — so this file is safe to keep around.
 *
 * Path: $MIRA_RUNS_FILE (relative to cwd) or ./mira-runs.jsonl by default.
 */
import { appendFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import type { Verdict } from "./assert.js";
import type { ProbeResult } from "./capture.js";

export const RUNS_FILE = resolve(process.cwd(), process.env.MIRA_RUNS_FILE ?? "mira-runs.jsonl");

/** Optional provenance attached by the loop runner (manual sends omit it). */
export interface RunMeta {
  probeId?: string;
  category?: string;
  hypothesis?: string;
  /** Assertion verdict, present only when the probe declared `expect`. */
  assert?: Verdict;
}

export async function appendRun(result: ProbeResult, meta: RunMeta = {}): Promise<void> {
  await mkdir(dirname(RUNS_FILE), { recursive: true });
  const record = { ...meta, ...result };
  await appendFile(RUNS_FILE, `${JSON.stringify(record)}\n`, "utf8");
}
