/**
 * stats helper tests — sparkline normalization + nearest-rank percentile. Pure, no
 * network. Run: `bun test`.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import type { RunRecord } from "../src/commands/report.js";
import { latencyStats, percentile, sparkline } from "../src/commands/stats.js";

function lr(firstReplyMs: number | null, timedOut = false): RunRecord {
  return { peer: "mira", sent: "x", messages: [], firstReplyMs, totalMs: 1, timedOut, ts: "" };
}

test("sparkline: empty -> '', length matches input, min->lowest glyph, max->highest", () => {
  assert.equal(sparkline([]), "");
  assert.equal(sparkline([5]).length, 1);
  const s = sparkline([1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(s.length, 8);
  assert.equal(s[0], "▁"); // the min maps to the lowest block
  assert.equal(s[s.length - 1], "█"); // the max maps to the full block
});

test("sparkline: flat series (no range) must not divide-by-zero or NaN out", () => {
  const s = sparkline([3, 3, 3]);
  assert.equal(s.length, 3);
  assert.ok(![...s].some((ch) => ch === undefined));
});

test("percentile: ascending nearest-rank, clamped at the top", () => {
  const xs = [10, 20, 30, 40, 50];
  assert.equal(percentile([], 50), 0);
  assert.equal(percentile(xs, 50), 30);
  assert.equal(percentile(xs, 95), 50); // clamps to the last element
  assert.equal(percentile(xs, 0), 10);
});

test("latencyStats: excludes timeouts / null / 0; reports min·median·p95·max", () => {
  const s = latencyStats([lr(1000), lr(3000), lr(2000), lr(null, true), lr(null), lr(0)]);
  assert.equal(s.count, 3); // only 1000 / 2000 / 3000 count
  assert.equal(s.min, 1000);
  assert.equal(s.max, 3000);
  assert.equal(s.median, 2000); // nearest-rank p50 of [1000,2000,3000]
});

test("latencyStats: empty input -> zeros, never NaN", () => {
  assert.deepEqual(latencyStats([]), { count: 0, min: 0, median: 0, p95: 0, max: 0 });
});
