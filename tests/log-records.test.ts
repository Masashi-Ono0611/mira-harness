/**
 * loadRunRecords robustness — a line that is valid JSON but the WRONG shape (a
 * number, a bare object, a half-written record) must be SKIPPED, never crash the
 * report/stats/diff/assert commands that consume it. Also covers blank-line and
 * malformed-JSON skipping + the category filter. Pure (temp file), no network.
 * Run: `bun test`.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildReport, loadRunRecords } from "../src/commands/report.js";

const TMP = join(tmpdir(), `mira-loadrunrecords.${process.pid}.jsonl`);
function write(lines: string[]): void {
  writeFileSync(TMP, lines.join("\n"), "utf8");
}
function clean(): void {
  rmSync(TMP, { force: true });
}

function validLine(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    peer: "mira",
    sent: "hello",
    messages: [],
    firstReplyMs: null,
    totalMs: 1,
    timedOut: true,
    ts: "2026-01-01T00:00:00Z",
    ...over,
  });
}

test("valid-JSON-but-wrong-shape lines are skipped (never crash downstream)", () => {
  write([
    validLine({ category: "core" }),
    "42", // a number
    '{"foo":1}', // object missing messages + sent
    '"just a string"', // a string
    '{"sent":"x"}', // sent present, messages missing
    '{"messages":[]}', // messages present, sent missing
    "", // blank line
    "{not json", // syntactically malformed
    validLine({ category: "core", sent: "world" }),
  ]);
  try {
    const recs = loadRunRecords(TMP);
    assert.equal(recs.length, 2); // only the two well-shaped records survive
    // The regression: a wrong-shape line used to crash buildReport on r.messages /
    // r.sent. The survivors must still render without throwing.
    assert.match(buildReport(recs), /## core/);
  } finally {
    clean();
  }
});

test("category filter keeps only matching records", () => {
  write([validLine({ category: "core" }), validLine({ category: "wallet" })]);
  try {
    assert.equal(loadRunRecords(TMP, "core").length, 1);
    assert.equal(loadRunRecords(TMP).length, 2);
  } finally {
    clean();
  }
});
