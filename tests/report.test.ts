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
