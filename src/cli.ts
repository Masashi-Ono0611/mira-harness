#!/usr/bin/env node
/**
 * mira-harness — automated probe harness for the @mira Telegram bot.
 *
 * Drives a Telegram userbot (GramJS) so you can message @mira, capture the FULL
 * reply (buttons / links / media / edits), and run a self-driving experiment
 * catalog — no screenshots, no copy-paste.
 */
import { Command } from "commander";
import { CATEGORIES } from "./catalog.js";
import { getVersion } from "./version.js";
import { login } from "./commands/login.js";
import { send } from "./commands/send.js";
import { loop } from "./commands/loop.js";
import { report } from "./commands/report.js";
import { doctor } from "./commands/doctor.js";
import { listCatalog } from "./commands/catalog.js";

/** Parse a non-negative millisecond option; reject NaN/Infinity/negative (would
 *  collapse setTimeout delays and silently remove the safety gap). */
function ms(name: string, v: string | undefined): number | undefined {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) {
    console.error(`--${name} must be a non-negative number of milliseconds (got "${v}")`);
    process.exit(1);
  }
  return n;
}

/** Parse a positive integer option (e.g. --max). */
function posInt(name: string, v: string): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) {
    console.error(`--${name} must be a positive integer (got "${v}")`);
    process.exit(1);
  }
  return n;
}

const program = new Command();

program
  .name("mira-harness")
  .description("Automated probe harness for the @mira Telegram bot (GramJS userbot).")
  .version(getVersion(), "-V, --version");

program
  .command("login")
  .description("One-time interactive login -> prints TG_SESSION for .env")
  .action(login);

program
  .command("doctor")
  .description("Check .env, session, connectivity and @mira resolution (read-only)")
  .action(doctor);

program
  .command("send")
  .description("Send one probe to @mira and print the full settled reply as JSON")
  .argument("[message...]", "the message (omit to read from stdin)")
  .option("-q, --quiet", "suppress the progress spinner / status line", false)
  .option("--settle <ms>", "quiet window before concluding a reply")
  .option("--timeout <ms>", "give up if no reply by this many ms")
  .action(async (parts: string[], opts: { quiet: boolean; settle?: string; timeout?: string }) => {
    await send(parts.join(" "), {
      quiet: opts.quiet,
      settle: ms("settle", opts.settle),
      timeout: ms("timeout", opts.timeout),
    });
  });

program
  .command("loop")
  .description("Run the experiment catalog against @mira at a human pace")
  .option("-c, --category <category>", `only this category (${CATEGORIES.join(" | ")})`)
  .option("-m, --max <n>", "max probes this run", "6")
  .option("--confirm", "press a safe ✅ Confirm on generation probes (spends credits)", false)
  .option("--peer <peer>", "'experiment'|'group' for TG_EXPERIMENT_CHAT, or a literal allowlisted peer")
  .option("--gap <ms>", "delay between sends")
  .option("--settle <ms>", "quiet window before concluding a reply")
  .option("--timeout <ms>", "give up if no reply by this many ms")
  .option("--list", "list the probes that would run, then exit (no sends)", false)
  .option("-q, --quiet", "suppress progress spinners", false)
  .action(
    async (opts: {
      category?: string;
      max: string;
      confirm: boolean;
      peer?: string;
      gap?: string;
      settle?: string;
      timeout?: string;
      list: boolean;
      quiet: boolean;
    }) => {
      await loop({
        category: opts.category,
        max: posInt("max", opts.max),
        confirm: opts.confirm,
        peer: opts.peer,
        gap: ms("gap", opts.gap),
        settle: ms("settle", opts.settle),
        timeout: ms("timeout", opts.timeout),
        list: opts.list,
        quiet: opts.quiet,
      });
    },
  );

program
  .command("catalog")
  .description("List the experiment catalog (no sends)")
  .option("-c, --category <category>", `only this category (${CATEGORIES.join(" | ")})`)
  .action((opts: { category?: string }) => listCatalog(opts.category));

program
  .command("report")
  .description("Distill the run log (JSONL) into a Markdown report")
  .option("--in <file>", "input JSONL (default: the run log)")
  .option("--out <file>", "write to a file instead of stdout")
  .action((opts: { in?: string; out?: string }) => {
    report({ in: opts.in, out: opts.out });
  });

program.addHelpText(
  "after",
  `
Examples:
  $ mira-harness login
  $ mira-harness doctor
  $ mira-harness send "STON_USDT_10"
  $ echo "STON_USDT_10" | mira-harness send
  $ mira-harness loop --category core
  $ mira-harness loop --list
  $ mira-harness loop --category generation --confirm
  $ mira-harness report --out report.md
`,
);

program
  .parseAsync(process.argv)
  .then(() => process.exit(0)) // exit before GramJS's post-disconnect update poll logs a benign TIMEOUT
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
