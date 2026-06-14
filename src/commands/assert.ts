/**
 * Offline re-grade — run a catalog's `expect` assertions against a SAVED run log
 * (no network, no @mira). The fast loop for developing assertions: capture once
 * with `loop`, then tune `expect` and re-grade instantly. Also CI-able WITHOUT a
 * Telegram session — grade a committed run-log fixture against the catalog.
 *
 *   mira-harness assert                                  # built-in catalog vs the run log
 *   mira-harness assert --catalog my.json --in run.jsonl
 *
 * Records are matched to probes by `probeId`; the catalog's CURRENT `expect` is
 * applied to the captured reply (the stored verdict, if any, is ignored).
 */
import { resolve } from "node:path";
import { evaluate, type Verdict } from "../assert.js";
import { CATALOG, loadCatalog, type Probe } from "../catalog.js";
import { RUNS_FILE } from "../log.js";
import { c, note } from "../ui.js";
import { loadRunRecords, type RunRecord } from "./report.js";

export interface AssertSummary {
  graded: number;
  passed: number;
  results: { id: string; verdict: Verdict }[];
}

/** Re-apply a catalog's `expect` to saved records. Pure — shared by the CLI and MCP. */
export function assertSummary(records: RunRecord[], source: Probe[]): AssertSummary {
  const byId = new Map(source.map((p) => [p.id, p]));
  const results: { id: string; verdict: Verdict }[] = [];
  for (const r of records) {
    if (!r.probeId) continue;
    const p = byId.get(r.probeId);
    if (!p?.expect) continue;
    results.push({ id: r.probeId, verdict: evaluate(p.expect, r) });
  }
  return { graded: results.length, passed: results.filter((g) => g.verdict.ok).length, results };
}

export interface AssertOptions {
  in?: string;
  catalog?: string;
  category?: string;
  json?: boolean;
  noFail?: boolean;
}

export function assertLog(opts: AssertOptions = {}): void {
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

  const source: Probe[] = opts.catalog ? loadCatalog(opts.catalog) : CATALOG;
  const { graded, passed, results } = assertSummary(records, source);
  const failed = results.filter((g) => !g.verdict.ok);

  if (opts.json) {
    console.log(JSON.stringify({ graded, passed, results }, null, 2));
    if (failed.length && !opts.noFail) process.exit(1);
    return;
  }

  note(c.bold(`assert  ${opts.catalog ?? "(built-in catalog)"} × ${opts.in ?? "(run log)"}`));
  if (!graded) {
    note(c.dim("  no records matched a probe with `expect` — nothing to grade."));
    return;
  }
  for (const g of results) {
    note(`  ${g.verdict.ok ? c.green("✓") : c.red("✗")} ${c.cyan(g.id)}`);
    if (!g.verdict.ok) {
      for (const ch of g.verdict.checks.filter((x) => !x.ok)) note(c.dim(`      ✗ ${ch.name}: ${ch.detail}`));
    }
  }
  note((failed.length ? c.red : c.green)(`\n${passed}/${graded} assertions passed.`));
  if (failed.length && !opts.noFail) process.exit(1);
}
