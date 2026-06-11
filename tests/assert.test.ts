/**
 * Assertion engine tests — `evaluate(expect, result)` is pure (no network). The
 * checks are structural/loose by design (an LLM bot is non-deterministic).
 * Run: `bun test`.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import { evaluate } from "../src/assert.js";
import type { CapturedMessage, ProbeResult } from "../src/capture.js";

function res(over: Partial<ProbeResult> = {}): ProbeResult {
  return {
    peer: "mira",
    sent: "x",
    messages: [{ id: 1, text: "hello", editCount: 0, buttons: [], links: [] }],
    firstReplyMs: 1000,
    totalMs: 1100,
    timedOut: false,
    ts: "",
    ...over,
  };
}
function msg(over: Partial<CapturedMessage> = {}): CapturedMessage {
  return { id: 1, text: "", editCount: 0, buttons: [], links: [], ...over };
}

test("replies: pass on a reply, fail on a timeout", () => {
  assert.equal(evaluate({ replies: true }, res()).ok, true);
  assert.equal(evaluate({ replies: true }, res({ timedOut: true, messages: [] })).ok, false);
});

test("textMatches: case-insensitive regex; invalid regex fails (never throws)", () => {
  assert.equal(evaluate({ textMatches: "hel+o" }, res()).ok, true);
  assert.equal(evaluate({ textMatches: "GRAM" }, res({ messages: [msg({ text: "It is gram." })] })).ok, true);
  assert.equal(evaluate({ textMatches: "nope" }, res()).ok, false);
  assert.equal(evaluate({ textMatches: "(" }, res()).ok, false);
});

test("minButtons / minLinks / hasWebApp", () => {
  const r = res({
    messages: [
      msg({ buttons: [{ text: "Launch", webAppUrl: "https://t.me/x?startapp=y" }], links: [{ url: "https://a" }] }),
    ],
  });
  assert.equal(evaluate({ minButtons: 1 }, r).ok, true);
  assert.equal(evaluate({ minButtons: 2 }, r).ok, false);
  assert.equal(evaluate({ minLinks: 1 }, r).ok, true);
  assert.equal(evaluate({ hasWebApp: true }, r).ok, true);
  assert.equal(evaluate({ hasWebApp: true }, res()).ok, false);
});

test("media kind match", () => {
  const photo = res({ messages: [msg({ media: { kind: "photo" } })] });
  assert.equal(evaluate({ media: "photo" }, photo).ok, true);
  assert.equal(evaluate({ media: "video" }, photo).ok, false);
});

test("maxFirstReplyMs (no reply fails)", () => {
  assert.equal(evaluate({ maxFirstReplyMs: 2000 }, res({ firstReplyMs: 1000 })).ok, true);
  assert.equal(evaluate({ maxFirstReplyMs: 500 }, res({ firstReplyMs: 1000 })).ok, false);
  assert.equal(evaluate({ maxFirstReplyMs: 500 }, res({ firstReplyMs: null })).ok, false);
});

test("json: valid only when the first text actually parses", () => {
  assert.equal(evaluate({ json: true }, res({ messages: [msg({ text: '{"ok":true}' })] })).ok, true);
  assert.equal(evaluate({ json: true }, res({ messages: [msg({ text: "```json\n{}\n```" })] })).ok, false);
});

test("multiple checks AND-combine; empty expect passes vacuously", () => {
  assert.equal(evaluate({ replies: true, maxFirstReplyMs: 2000 }, res()).ok, true);
  assert.equal(evaluate({ replies: true, maxFirstReplyMs: 500 }, res()).ok, false);
  assert.equal(evaluate({}, res()).ok, true);
  // verdict carries one check per declared expectation
  assert.equal(evaluate({ replies: true, minLinks: 0 }, res()).checks.length, 2);
});
