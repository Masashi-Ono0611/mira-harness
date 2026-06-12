/**
 * env.apiId() validation — a non-numeric / zero / negative TG_API_ID must THROW (so
 * `doctor` flags it) instead of silently yielding NaN and failing deep inside GramJS
 * later. Run: `bun test`.
 */
import { afterEach, test } from "bun:test";
import assert from "node:assert/strict";
import { tgEnv } from "../src/env.js";

const original = process.env.TG_API_ID;
afterEach(() => {
  if (original === undefined) delete process.env.TG_API_ID;
  else process.env.TG_API_ID = original;
});

test("apiId: a valid positive integer parses", () => {
  process.env.TG_API_ID = "123456";
  assert.equal(tgEnv.apiId(), 123456);
});

test("apiId: non-numeric throws (no silent NaN)", () => {
  process.env.TG_API_ID = "not-a-number";
  assert.throws(() => tgEnv.apiId(), /positive integer/);
});

test("apiId: zero / negative / float are rejected", () => {
  for (const bad of ["0", "-5", "12.5"]) {
    process.env.TG_API_ID = bad;
    assert.throws(() => tgEnv.apiId(), /positive integer/);
  }
});

test("apiId: empty is rejected by the required-var guard", () => {
  process.env.TG_API_ID = "";
  assert.throws(() => tgEnv.apiId(), /Missing env var/); // req() catches empty first
});
