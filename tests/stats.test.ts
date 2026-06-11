/**
 * stats helper tests — sparkline normalization + nearest-rank percentile. Pure, no
 * network. Run: `bun test`.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import { percentile, sparkline } from "../src/commands/stats.js";

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
