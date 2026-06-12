/**
 * buildReport tests — every category present gets a section (built-in AND custom),
 * with "(uncategorized)" reserved for records that carry no category. Pure, no
 * network. Run: `bun test`.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import type { ProbeResult } from "../src/capture.js";
import { buildReport } from "../src/commands/report.js";

type Rec = ProbeResult & { category?: string };
function rec(category?: string): Rec {
  return {
    peer: "mira",
    sent: "x",
    category,
    messages: [{ id: 1, text: "t", editCount: 0, buttons: [], links: [] }],
    firstReplyMs: 1000,
    totalMs: 1100,
    timedOut: false,
    ts: "",
  };
}

test("built-in + custom category each get a section; no-category -> uncategorized", () => {
  const md = buildReport([rec("core"), rec("smoke"), rec(undefined)]);
  assert.match(md, /## core/);
  assert.match(md, /## smoke/); // custom category preserved (not dumped into uncategorized)
  assert.match(md, /## \(uncategorized\)/);
});

test("filtered to a single custom category -> only that section", () => {
  const md = buildReport([rec("smoke"), rec("smoke")]);
  assert.match(md, /## smoke/);
  assert.doesNotMatch(md, /## core/);
  assert.doesNotMatch(md, /## \(uncategorized\)/);
});

test("summary line: probe/reply/timeout counts + latency avg/max + assertions passed", () => {
  const slow: Rec = { ...rec("core"), firstReplyMs: 3000 };
  const timedout: Rec = { ...rec("core"), timedOut: true, firstReplyMs: null };
  const graded: Rec & { assert?: { ok: boolean; checks: [] } } = { ...rec("core"), assert: { ok: true, checks: [] } };
  const md = buildReport([rec("core"), slow, timedout, graded]); // firstReplyMs: 1000, 3000, —, 1000
  assert.match(md, /\*\*4\*\* probes/);
  assert.match(md, /\*\*3\*\* replied/);
  assert.match(md, /\*\*1\*\* timed out/);
  assert.match(md, /\*\*1\/1\*\* assertions passed/);
  assert.match(md, /avg \*\*1\.7s\*\*/); // (1000+3000+1000)/3 = 1666ms
  assert.match(md, /max \*\*3\.0s\*\*/);
});
