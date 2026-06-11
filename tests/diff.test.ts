/**
 * Drift tests — `diffRuns(baseline, current)` is pure (no network). Structural
 * comparison; regressions are timeout/verdict flips and >2x latency blow-ups.
 * Run: `bun test`.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import type { CapturedMessage } from "../src/capture.js";
import { diffRuns } from "../src/commands/diff.js";
import type { RunRecord } from "../src/commands/report.js";

function rec(over: Partial<RunRecord> = {}): RunRecord {
  return {
    peer: "mira",
    sent: "x",
    probeId: "p1",
    messages: [{ id: 1, text: "hi", editCount: 0, buttons: [], links: [] }],
    firstReplyMs: 1000,
    totalMs: 1100,
    timedOut: false,
    ts: "",
    ...over,
  };
}
function msg(over: Partial<CapturedMessage> = {}): CapturedMessage {
  return { id: 1, text: "x", editCount: 0, buttons: [], links: [], ...over };
}

test("no drift between identical runs", () => {
  assert.equal(diffRuns([rec()], [rec()]).length, 0);
});

test("assertion verdict flip ✓->✗ is a regression naming the failed check", () => {
  const base = [rec({ assert: { ok: true, checks: [{ name: "json", ok: true, detail: "" }] } })];
  const cur = [rec({ assert: { ok: false, checks: [{ name: "json", ok: false, detail: "" }] } })];
  assert.equal(
    diffRuns(base, cur).some((i) => i.kind === "regression" && /assertion now FAILS \(json\)/.test(i.what)),
    true,
  );
});

test("verdict flip ✗->✓ is an improvement", () => {
  const base = [rec({ assert: { ok: false, checks: [] } })];
  const cur = [rec({ assert: { ok: true, checks: [] } })];
  assert.equal(
    diffRuns(base, cur).some((i) => i.kind === "improvement"),
    true,
  );
});

test("reply->timeout is a regression; timeout->reply is an improvement", () => {
  assert.equal(
    diffRuns([rec()], [rec({ timedOut: true })]).some((i) => i.kind === "regression"),
    true,
  );
  assert.equal(
    diffRuns([rec({ timedOut: true })], [rec()]).some((i) => i.kind === "improvement"),
    true,
  );
});

test("latency regression only when >2x AND >5s jump", () => {
  assert.equal(
    diffRuns([rec({ firstReplyMs: 1000 })], [rec({ firstReplyMs: 10000 })]).some((i) => i.kind === "regression"),
    true,
  );
  // 2x but only +1s -> not a regression
  assert.equal(
    diffRuns([rec({ firstReplyMs: 1000 })], [rec({ firstReplyMs: 2000 })]).some((i) => i.kind === "regression"),
    false,
  );
});

test("surface change is informational (change), never a regression", () => {
  const base = [rec({ messages: [msg({ buttons: [] })] })];
  const cur = [rec({ messages: [msg({ buttons: [{ text: "Go" }] })] })];
  const items = diffRuns(base, cur);
  assert.equal(
    items.some((i) => i.kind === "change" && /buttons 0 -> 1/.test(i.what)),
    true,
  );
  assert.equal(
    items.some((i) => i.kind === "regression"),
    false,
  );
});

test("added / removed probes", () => {
  assert.equal(
    diffRuns([], [rec({ probeId: "p1" })]).some((i) => i.kind === "added"),
    true,
  );
  assert.equal(
    diffRuns([rec({ probeId: "p1" })], []).some((i) => i.kind === "removed"),
    true,
  );
});
