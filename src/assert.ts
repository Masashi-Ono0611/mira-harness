/**
 * Probe assertions — turn an observed reply into a PASS/FAIL verdict.
 *
 * A probe's optional `expect` declares machine-checkable expectations; `evaluate`
 * runs them against the captured ProbeResult. @mira is an LLM (non-deterministic),
 * so the checks are deliberately STRUCTURAL and loose — a reply arrived, >= N
 * links, valid JSON, a latency bound — never exact text, which would flake.
 *
 * Probes WITHOUT `expect` are not graded: they stay observe-only / informational.
 */
import { z } from "zod";
import type { ProbeResult } from "./capture.js";

export const ExpectSchema = z.object({
  /** A reply must arrive (no timeout, >= 1 message). Set false to expect a timeout. */
  replies: z.boolean().optional(),
  /** Some message text matches this regex (case-insensitive). */
  textMatches: z.string().optional(),
  /** Total inline buttons across all messages >= this. */
  minButtons: z.number().int().nonnegative().optional(),
  /** Total links across all messages >= this. */
  minLinks: z.number().int().nonnegative().optional(),
  /** At least one button is a web_app / startapp Mini App "Launch". */
  hasWebApp: z.boolean().optional(),
  /** At least one message carries media of this kind. */
  media: z.enum(["photo", "video", "audio", "document", "webpage", "other"]).optional(),
  /** First-reply latency must be within this many ms. */
  maxFirstReplyMs: z.number().positive().optional(),
  /** The first non-empty message text parses as JSON (strict-JSON probes). */
  json: z.boolean().optional(),
});
export type Expect = z.infer<typeof ExpectSchema>;

export interface Check {
  name: string;
  ok: boolean;
  detail: string;
}
export interface Verdict {
  ok: boolean;
  checks: Check[];
}

/** Run a probe's expectations against its captured result. Pure — no network. */
export function evaluate(expect: Expect, result: ProbeResult): Verdict {
  const checks: Check[] = [];
  const texts = result.messages.map((m) => m.text).filter((t) => t.length > 0);
  const firstText = texts[0] ?? "";
  const buttons = result.messages.reduce((n, m) => n + m.buttons.length, 0);
  const links = result.messages.reduce((n, m) => n + m.links.length, 0);
  const webApp = result.messages.some((m) => m.buttons.some((b) => b.webAppUrl !== undefined));
  const mediaKinds = result.messages
    .map((m) => m.media?.kind)
    .filter((k): k is NonNullable<typeof k> => k !== undefined);
  const add = (name: string, ok: boolean, detail: string): void => {
    checks.push({ name, ok, detail });
  };

  if (expect.replies !== undefined) {
    const replied = !result.timedOut && result.messages.length > 0;
    add("replies", replied === expect.replies, result.timedOut ? "timed out" : `${result.messages.length} message(s)`);
  }
  if (expect.textMatches !== undefined) {
    const pattern = expect.textMatches;
    let compiled: RegExp | undefined;
    try {
      compiled = new RegExp(pattern, "i");
    } catch {
      compiled = undefined;
    }
    const rx = compiled;
    const ok = rx ? texts.some((t) => rx.test(t)) : false;
    add("textMatches", ok, rx ? `/${pattern}/i` : `invalid regex: ${pattern}`);
  }
  if (expect.minButtons !== undefined) {
    add("minButtons", buttons >= expect.minButtons, `${buttons} >= ${expect.minButtons}`);
  }
  if (expect.minLinks !== undefined) {
    add("minLinks", links >= expect.minLinks, `${links} >= ${expect.minLinks}`);
  }
  if (expect.hasWebApp !== undefined) {
    add("hasWebApp", webApp === expect.hasWebApp, `webApp=${webApp}`);
  }
  if (expect.media !== undefined) {
    add("media", mediaKinds.includes(expect.media), `kinds=[${mediaKinds.join(",")}] want ${expect.media}`);
  }
  if (expect.maxFirstReplyMs !== undefined) {
    const ms = result.firstReplyMs;
    add(
      "maxFirstReplyMs",
      ms !== null && ms <= expect.maxFirstReplyMs,
      ms === null ? "no reply" : `${ms}ms <= ${expect.maxFirstReplyMs}ms`,
    );
  }
  if (expect.json === true) {
    let ok = false;
    try {
      JSON.parse(firstText);
      ok = firstText.length > 0;
    } catch {
      ok = false;
    }
    add("json", ok, ok ? "valid JSON" : "not valid JSON");
  }

  return { ok: checks.every((ch) => ch.ok), checks };
}
