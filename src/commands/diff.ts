/**
 * Behavioral drift between two run logs — "did @mira change?"
 *
 *   mira-harness diff baseline.jsonl                 # baseline vs the current run log
 *   mira-harness diff baseline.jsonl current.jsonl
 *
 * Pure read + compare (no network). Matches probes by `probeId` (last record per
 * id wins) and reports STRUCTURAL drift — @mira is an LLM, so exact-text diffs are
 * noise. Regressions (a probe that now times out, an assertion that flipped ✓->✗,
 * or a >2x latency blow-up) exit non-zero so it drops into CI; surface changes and
 * improvements are reported but don't fail.
 */
import { resolve } from "node:path";
import { RUNS_FILE } from "../log.js";
import { c, note } from "../ui.js";
import { loadRunRecords, type RunRecord } from "./report.js";

export type DriftKind = "regression" | "improvement" | "change" | "added" | "removed";
export interface DriftItem {
  probeId: string;
  kind: DriftKind;
  what: string;
}

/** Latest record per probeId (run logs are append-only, so last wins). */
function lastByProbe(records: RunRecord[]): Map<string, RunRecord> {
  const m = new Map<string, RunRecord>();
  for (const r of records) {
    if (r.probeId) m.set(r.probeId, r);
  }
  return m;
}

function signals(r: RunRecord): { buttons: number; links: number; media: string } {
  const buttons = r.messages.reduce((n, m) => n + m.buttons.length, 0);
  const links = r.messages.reduce((n, m) => n + m.links.length, 0);
  const media = r.messages
    .map((m) => m.media?.kind)
    .filter((k): k is NonNullable<typeof k> => k !== undefined)
    .join(",");
  return { buttons, links, media };
}

/** Compare two run logs probe-by-probe. Pure — exported for tests. */
export function diffRuns(baseline: RunRecord[], current: RunRecord[]): DriftItem[] {
  const base = lastByProbe(baseline);
  const cur = lastByProbe(current);
  const items: DriftItem[] = [];

  for (const id of [...new Set([...base.keys(), ...cur.keys()])].sort()) {
    const b = base.get(id);
    const c2 = cur.get(id);
    if (b && !c2) {
      items.push({ probeId: id, kind: "removed", what: "in baseline, not in current" });
      continue;
    }
    if (c2 && !b) {
      items.push({ probeId: id, kind: "added", what: "new in current (not in baseline)" });
      continue;
    }
    if (!b || !c2) continue;

    // reply / timeout flip
    if (!b.timedOut && c2.timedOut)
      items.push({ probeId: id, kind: "regression", what: "now times out (was replying)" });
    else if (b.timedOut && !c2.timedOut)
      items.push({ probeId: id, kind: "improvement", what: "now replies (was timing out)" });

    // assertion verdict flip
    const ba = b.assert;
    const ca = c2.assert;
    if (ba && ca && ba.ok !== ca.ok) {
      if (ba.ok && !ca.ok) {
        const failed = ca.checks
          .filter((x) => !x.ok)
          .map((x) => x.name)
          .join(", ");
        items.push({ probeId: id, kind: "regression", what: `assertion now FAILS (${failed})` });
      } else {
        items.push({ probeId: id, kind: "improvement", what: "assertion now passes" });
      }
    }

    // latency regression (both replied): >2x slower AND >5s absolute jump
    if (b.firstReplyMs !== null && c2.firstReplyMs !== null) {
      const bms = b.firstReplyMs;
      const cms = c2.firstReplyMs;
      if (cms > bms * 2 && cms - bms > 5000) {
        items.push({
          probeId: id,
          kind: "regression",
          what: `first reply ${(bms / 1000).toFixed(1)}s -> ${(cms / 1000).toFixed(1)}s (>2x slower)`,
        });
      }
    }

    // structural surface changes (informational — assertions catch the ones that matter)
    const bs = signals(b);
    const cs = signals(c2);
    if (bs.buttons !== cs.buttons)
      items.push({ probeId: id, kind: "change", what: `buttons ${bs.buttons} -> ${cs.buttons}` });
    if (bs.links !== cs.links) items.push({ probeId: id, kind: "change", what: `links ${bs.links} -> ${cs.links}` });
    if (bs.media !== cs.media)
      items.push({ probeId: id, kind: "change", what: `media [${bs.media}] -> [${cs.media}]` });
  }
  return items;
}

export interface DiffOptions {
  baseline: string;
  /** Defaults to the current run log when omitted. */
  current?: string;
  json?: boolean;
  noFail?: boolean;
}

function load(path: string | undefined, label: string): RunRecord[] | null {
  try {
    return loadRunRecords(path);
  } catch (e) {
    const shown = path ? resolve(process.cwd(), path) : RUNS_FILE;
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") console.error(`${label}: no run log at ${shown}`);
    else console.error(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

export function diff(opts: DiffOptions): void {
  const base = load(opts.baseline, "baseline");
  const cur = load(opts.current, "current");
  if (!base || !cur) process.exit(1);

  const items = diffRuns(base, cur);
  const regressions = items.filter((i) => i.kind === "regression");

  if (opts.json) {
    console.log(JSON.stringify({ regressions: regressions.length, drift: items.length, items }, null, 2));
    if (regressions.length && !opts.noFail) process.exit(1);
    return;
  }

  note(c.bold(`drift  ${opts.baseline} -> ${opts.current ?? "(current run log)"}`));
  if (!items.length) {
    note(c.green("  no drift detected."));
    return;
  }
  const paint: Record<DriftKind, (s: string) => string> = {
    regression: (s) => c.red(s),
    improvement: (s) => c.green(s),
    change: (s) => c.dim(s),
    added: (s) => c.dim(s),
    removed: (s) => c.dim(s),
  };
  for (const i of items) {
    note(`  ${paint[i.kind](i.kind.padEnd(11))} ${c.cyan(i.probeId)} — ${i.what}`);
  }
  note(regressions.length ? c.red(`\n${regressions.length} regression(s).`) : c.green("\nno regressions."));
  if (regressions.length && !opts.noFail) process.exit(1);
}
