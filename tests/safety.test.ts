/**
 * Safety-guard tests for findConfirmButton — the gate that lets `loop --confirm`
 * press ONLY a one-shot generation Confirm, never wallet/OAuth/"Always yes".
 * Pure, no network. Run: `npm test`.
 */
import assert from "node:assert/strict";
import type { CapturedButton, CapturedMessage, ProbeResult } from "../src/capture.js";
import { findConfirmButton } from "../src/commands/loop.js";

const b64 = (s: string): string => Buffer.from(s).toString("base64");

function res(messages: CapturedMessage[]): ProbeResult {
  return { peer: "mira", sent: "x", messages, firstReplyMs: 1, totalMs: 1, timedOut: false, ts: "" };
}
function m(id: number, text: string, buttons: CapturedButton[]): CapturedMessage {
  return { id, text, editCount: 0, buttons, links: [] };
}

// 1. a plain one-shot Confirm callback IS found
{
  const f = findConfirmButton(res([m(1, "Model: X · Cost 30 🪙 · Confirm?", [{ text: "✅ Confirm", callbackData: b64("go") }])]));
  assert.ok(f);
  assert.equal(f?.label, "✅ Confirm");
  assert.equal(f?.msgId, 1);
}
// 2. "Always yes" (persistent) is NEVER pressed
assert.equal(
  findConfirmButton(res([m(1, "Confirm?", [{ text: "✅ Always yes", callbackData: b64("a") }])])),
  undefined,
);
// 3. a url button (no callbackData) is not actionable
assert.equal(
  findConfirmButton(res([m(1, "Confirm?", [{ text: "✅ Confirm", url: "https://x" }])])),
  undefined,
);
// 4. a wallet/transfer context message is skipped entirely
assert.equal(
  findConfirmButton(res([m(1, "Confirm this wallet transfer?", [{ text: "✅ Confirm", callbackData: b64("w") }])])),
  undefined,
);
// 5. an OAuth/Connect button is refused
assert.equal(
  findConfirmButton(res([m(1, "Authorize?", [{ text: "Connect github", callbackData: b64("c") }])])),
  undefined,
);
// 6. a non-confirm callback (e.g. Cancel) is ignored
assert.equal(
  findConfirmButton(res([m(1, "options", [{ text: "Cancel", callbackData: b64("n") }])])),
  undefined,
);
// 7. "Generate" counts as confirm-ish
assert.ok(findConfirmButton(res([m(1, "ready", [{ text: "Generate", callbackData: b64("g") }])])));

console.log("safety.test.ts: all assertions passed ✅");
