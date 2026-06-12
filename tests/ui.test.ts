/**
 * oscSafe — strips control chars (BEL / ESC / newline / NUL / DEL …) before a
 * probe id / category is embedded in an OSC escape sequence (terminal title +
 * completion notification), so user-controlled text can't break out of or inject
 * into the sequence. Run: `bun test`.
 */
import { test } from "bun:test";
import assert from "node:assert/strict";
import { oscSafe } from "../src/ui.js";

test("oscSafe: strips BEL / ESC / newline and other control chars", () => {
  assert.equal(oscSafe("hello"), "hello");
  assert.equal(oscSafe("a\x07b"), "a b"); // BEL would terminate an OSC early
  assert.equal(oscSafe("a\x1bb"), "a b"); // ESC would start a new sequence
  assert.equal(oscSafe("a\nb"), "a b"); // newline
  assert.equal(oscSafe("a\x00b"), "a b"); // NUL
  assert.equal(oscSafe("a\x7fb"), "a b"); // DEL
});

test("oscSafe: trims whitespace left behind by stripping", () => {
  assert.equal(oscSafe("\x1b mira \x07"), "mira");
});
