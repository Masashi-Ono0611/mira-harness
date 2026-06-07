/**
 * Distill the run log (JSONL) into a readable Markdown report.
 *
 *   mira-harness report                       # print to stdout
 *   mira-harness report --out report.md
 *
 * Pure read + format (no network), safe to run anytime.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ProbeResult } from "../capture.js";
import { RUNS_FILE } from "../log.js";
import { CATEGORIES } from "../catalog.js";

type RunRecord = ProbeResult & { probeId?: string; category?: string; hypothesis?: string };

function truncate(s: string, n: number): string {
  const flat = s.replace(/\s+/g, " ").trim();
  return flat.length > n ? `${flat.slice(0, n - 1)}…` : flat;
}

/** Escape a value for a Markdown table cell (a literal `|` would add a column). */
function cell(s: string): string {
  return s.replace(/\|/g, "\\|");
}

/** Buttons / links / media / edits signals across all messages of a probe. */
function signals(r: RunRecord): string {
  const btns = r.messages.reduce((n, m) => n + m.buttons.length, 0);
  const links = r.messages.reduce((n, m) => n + m.links.length, 0);
  const media = r.messages.filter((m) => m.media).map((m) => m.media?.kind);
  const edits = r.messages.reduce((n, m) => n + m.editCount, 0);
  return (
    [
      btns ? `${btns}btn` : "",
      links ? `${links}link` : "",
      media.length ? `media=${media.join(",")}` : "",
      edits ? `${edits}edit` : "",
    ]
      .filter(Boolean)
      .join(" ") || "—"
  );
}

/** First non-empty message text — the gist of the reply. */
function gist(r: RunRecord): string {
  const first = r.messages.find((m) => m.text)?.text ?? (r.messages.length ? "(non-text)" : "(no reply)");
  return truncate(first, 90);
}

function table(rows: RunRecord[]): string {
  const head =
    "| Probe | Sent | Reply (gist) | Signals | First reply | Settled |\n" +
    "|---|---|---|---|---|---|";
  const body = rows
    .map((r) => {
      const id = r.probeId ?? "—";
      const sent = cell(truncate(r.sent, 40));
      const reply = r.timedOut ? "**TIMEOUT**" : cell(gist(r));
      const first = r.firstReplyMs === null ? "—" : `${(r.firstReplyMs / 1000).toFixed(1)}s`;
      const total = `${(r.totalMs / 1000).toFixed(1)}s`;
      return `| \`${cell(id)}\` | ${sent} | ${reply} | ${cell(signals(r))} | ${first} | ${total} |`;
    })
    .join("\n");
  return `${head}\n${body}`;
}

export function buildReport(records: RunRecord[]): string {
  const replied = records.filter((r) => !r.timedOut);
  const latencies = replied.map((r) => r.firstReplyMs ?? 0).filter((n) => n > 0);
  const avg = latencies.length ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
  const max = latencies.length ? Math.max(...latencies) : 0;

  const out: string[] = [];
  out.push("# Mira(@mira) probe report (auto-generated)");
  out.push("");
  out.push("> Distilled from the run log by `mira-harness report`.");
  out.push("");
  out.push(
    `**${records.length}** probes · **${replied.length}** replied · **${records.length - replied.length}** timed out · ` +
      `first-reply avg **${(avg / 1000).toFixed(1)}s** / max **${(max / 1000).toFixed(1)}s**.`,
  );
  out.push("");

  // Section per category present: built-in categories first (in their canonical
  // order), then any custom-catalog categories in first-seen order, then a final
  // bucket only for records that carry no category at all.
  const builtin = (CATEGORIES as readonly string[]).filter((c) => records.some((r) => r.category === c));
  const custom: string[] = [];
  for (const r of records) {
    if (r.category && !(CATEGORIES as readonly string[]).includes(r.category) && !custom.includes(r.category)) {
      custom.push(r.category);
    }
  }
  for (const cat of [...builtin, ...custom]) {
    out.push(`## ${cat}`, "", table(records.filter((r) => r.category === cat)), "");
  }
  const uncategorized = records.filter((r) => !r.category);
  if (uncategorized.length) out.push("## (uncategorized)", "", table(uncategorized), "");
  return out.join("\n");
}

export interface ReportOptions {
  in?: string;
  out?: string;
  category?: string;
}

/**
 * Read the run log (JSONL) and return the Markdown report as a string. Throws on a
 * missing/empty log (callers decide how to surface it). Shared by the CLI command
 * and the MCP `mira_report` tool — neither writes to stdout from here.
 */
export function renderReport(inFile?: string, category?: string): string {
  const path = inFile ? resolve(process.cwd(), inFile) : RUNS_FILE;
  const raw = readFileSync(path, "utf8"); // throws ENOENT when absent
  let records: RunRecord[] = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      records.push(JSON.parse(t) as RunRecord);
    } catch {
      // skip malformed lines silently
    }
  }
  if (category) records = records.filter((r) => r.category === category);
  if (!records.length) {
    throw new Error(category ? `no probes in category "${category}" in the run log.` : "run log is empty.");
  }
  return buildReport(records);
}

export function report(opts: ReportOptions): void {
  let md: string;
  try {
    md = renderReport(opts.in, opts.category);
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === "ENOENT") {
      const path = opts.in ? resolve(process.cwd(), opts.in) : RUNS_FILE;
      console.error(`no run log at ${path} — run \`mira-harness send\` or \`mira-harness loop\` first.`);
    } else {
      console.error(e instanceof Error ? e.message : String(e));
    }
    process.exit(1);
  }
  if (opts.out) {
    const dest = resolve(process.cwd(), opts.out);
    writeFileSync(dest, `${md}\n`, "utf8");
    console.error(`wrote report to ${opts.out}`);
  } else {
    console.log(md);
  }
}
