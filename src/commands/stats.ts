/**
 * At-a-glance dashboard over the run log — the playful sibling of `report`.
 *
 *   mira-harness stats                # colored dashboard (stderr)
 *   mira-harness stats --category core
 *   mira-harness stats --json         # machine-readable summary (stdout)
 *
 * Pure read + format (no network), safe to run anytime. Where `report` emits a
 * per-probe Markdown table, `stats` rolls the log up into totals, latency records,
 * a per-category breakdown, and an ASCII sparkline of first-reply times over time.
 */
import { resolve } from "node:path";
import { RUNS_FILE } from "../log.js";
import { c, note } from "../ui.js";
import { loadRunRecords, type RunRecord } from "./report.js";

const SPARK = "▁▂▃▄▅▆▇█";

/** Map a series to a Unicode sparkline, normalized between its own min and max. */
export function sparkline(values: number[]): string {
  if (!values.length) return "";
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min || 1;
  return values.map((v) => SPARK[Math.min(SPARK.length - 1, Math.floor(((v - min) / range) * SPARK.length))]).join("");
}

/** Nearest-rank percentile of an ASCENDING-sorted array (0 for empty). */
export function percentile(sortedAsc: number[], p: number): number {
  if (!sortedAsc.length) return 0;
  const idx = Math.min(sortedAsc.length - 1, Math.floor((p / 100) * sortedAsc.length));
  return sortedAsc[idx] ?? 0;
}

const secs = (ms: number): string => `${(ms / 1000).toFixed(1)}s`;

/** Latency stats over the first-reply times that actually arrived. */
function latencyStats(records: RunRecord[]): {
  count: number;
  min: number;
  median: number;
  p95: number;
  max: number;
} {
  const latencies = records
    .filter((r) => !r.timedOut && r.firstReplyMs !== null && r.firstReplyMs > 0)
    .map((r) => r.firstReplyMs as number)
    .sort((a, b) => a - b);
  return {
    count: latencies.length,
    min: latencies[0] ?? 0,
    median: percentile(latencies, 50),
    p95: percentile(latencies, 95),
    max: latencies[latencies.length - 1] ?? 0,
  };
}

export interface StatsOptions {
  in?: string;
  category?: string;
  json?: boolean;
}

export function stats(opts: StatsOptions = {}): void {
  let records: RunRecord[];
  try {
    records = loadRunRecords(opts.in, opts.category);
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      const path = opts.in ? resolve(process.cwd(), opts.in) : RUNS_FILE;
      console.error(`no run log at ${path} — run \`mira-harness send\` or \`mira-harness loop\` first.`);
    } else {
      console.error(e instanceof Error ? e.message : String(e));
    }
    process.exit(1);
  }

  if (!records.length) {
    console.error(
      opts.category
        ? `no probes in category "${opts.category}" in the run log.`
        : "run log is empty — run `mira-harness send` or `mira-harness loop` first.",
    );
    process.exit(1);
  }

  const replied = records.filter((r) => !r.timedOut);
  const timedOut = records.length - replied.length;
  const lat = latencyStats(records);

  // Per-category rollup (counts + reply rate), in first-seen order.
  const byCat = new Map<string, { total: number; replied: number }>();
  for (const r of records) {
    const key = r.category ?? "(uncategorized)";
    const e = byCat.get(key) ?? { total: 0, replied: 0 };
    e.total += 1;
    if (!r.timedOut) e.replied += 1;
    byCat.set(key, e);
  }

  // Sparkline of first-reply times in chronological order.
  const series = [...records]
    .sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
    .filter((r) => !r.timedOut && r.firstReplyMs !== null && r.firstReplyMs > 0)
    .map((r) => r.firstReplyMs as number);

  if (opts.json) {
    console.log(
      JSON.stringify(
        {
          probes: records.length,
          replied: replied.length,
          timedOut,
          latencyMs: lat.count ? { min: lat.min, median: lat.median, p95: lat.p95, max: lat.max } : null,
          byCategory: Object.fromEntries([...byCat].map(([k, v]) => [k, v])),
        },
        null,
        2,
      ),
    );
    return;
  }

  const rate = (n: number, total: number): string => `${total ? Math.round((n / total) * 100) : 0}%`;

  note(c.bold(`📊 mira stats${opts.category ? ` [${opts.category}]` : ""}`));
  note(
    `  ${c.cyan(String(records.length))} probes · ${c.green(`${replied.length} replied`)} · ` +
      (timedOut ? c.yellow(`${timedOut} timed out`) : c.dim("0 timed out")) +
      c.dim(`  (${rate(replied.length, records.length)} reply rate)`),
  );

  if (lat.count) {
    note("");
    note(c.bold("  first-reply latency"));
    note(
      `    🏆 fastest ${c.green(secs(lat.min))}   median ${c.cyan(secs(lat.median))}   ` +
        `p95 ${c.cyan(secs(lat.p95))}   slowest ${c.yellow(secs(lat.max))}`,
    );
    if (series.length > 1)
      note(`    ${c.magenta(sparkline(series))}  ${c.dim(`(${series.length} replies, oldest→newest)`)}`);
  } else {
    note(c.dim("  no first-reply times recorded yet."));
  }

  note("");
  note(c.bold("  by category"));
  for (const [cat, v] of byCat) {
    note(
      `    ${c.cyan(cat.padEnd(16))} ${String(v.total).padStart(3)} probes  ${c.dim(`${rate(v.replied, v.total)} replied`)}`,
    );
  }
}
