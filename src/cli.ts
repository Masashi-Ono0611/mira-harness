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
import { listCatalog } from "./commands/catalog.js";
import { doctor } from "./commands/doctor.js";
import { login } from "./commands/login.js";
import { loop } from "./commands/loop.js";
import { report } from "./commands/report.js";
import { send } from "./commands/send.js";
import { stats } from "./commands/stats.js";
import { watch } from "./commands/watch.js";
import { banner } from "./ui.js";
import { getVersion } from "./version.js";

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
const version = getVersion();

program
  .name("mira-harness")
  .description("Automated probe harness for the @mira Telegram bot (GramJS userbot).")
  .version(version, "-V, --version");

// Mascot banner before every command (stderr/TTY only; suppressed by --quiet).
program.hook("preAction", (_thisCommand, actionCommand) => {
  banner(version, { quiet: Boolean((actionCommand.opts() as { quiet?: boolean }).quiet) });
});

program.command("login").description("One-time interactive login -> prints TG_SESSION for .env").action(login);

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
  .option("--no-log", "do not append the result to the run log")
  .action(async (parts: string[], opts: { quiet: boolean; settle?: string; timeout?: string; log: boolean }) => {
    await send(parts.join(" "), {
      quiet: opts.quiet,
      settle: ms("settle", opts.settle),
      timeout: ms("timeout", opts.timeout),
      noLog: opts.log === false,
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
  .option("--catalog <file>", "custom catalog JSON file (instead of the built-in catalog)")
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
      catalog?: string;
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
        catalog: opts.catalog,
        quiet: opts.quiet,
      });
    },
  );

program
  .command("catalog")
  .description("List the experiment catalog (no sends)")
  .option("-c, --category <category>", `only this category (${CATEGORIES.join(" | ")})`)
  .option("--catalog <file>", "custom catalog JSON file (instead of the built-in catalog)")
  .option("--json", "output JSON instead of the colored list", false)
  .action((opts: { category?: string; catalog?: string; json: boolean }) =>
    listCatalog({ category: opts.category, catalog: opts.catalog, json: opts.json }),
  );

program
  .command("watch")
  .description("Live-tail @mira's messages (observe-only — sends nothing). Ctrl-C to stop")
  .option("--peer <peer>", "'experiment'|'group' for TG_EXPERIMENT_CHAT, or a literal allowlisted peer")
  .action(async (opts: { peer?: string }) => {
    await watch({ peer: opts.peer });
  });

program
  .command("report")
  .description("Distill the run log (JSONL) into a Markdown report")
  .option("--in <file>", "input JSONL (default: the run log)")
  .option("--out <file>", "write to a file instead of stdout")
  .option("-c, --category <category>", "only include probes from this category")
  .action((opts: { in?: string; out?: string; category?: string }) => {
    report({ in: opts.in, out: opts.out, category: opts.category });
  });

program
  .command("stats")
  .description("At-a-glance run-log dashboard: totals, latency records, sparkline")
  .option("--in <file>", "input JSONL (default: the run log)")
  .option("-c, --category <category>", "only include probes from this category")
  .option("--json", "output a JSON summary instead of the colored dashboard", false)
  .action((opts: { in?: string; category?: string; json: boolean }) => {
    stats({ in: opts.in, category: opts.category, json: opts.json });
  });

program.addHelpText(
  "after",
  `
Examples:
  $ mira-harness login
  $ mira-harness doctor
  $ mira-harness send "What can you do?"
  $ echo "What can you do?" | mira-harness send
  $ mira-harness loop --category core
  $ mira-harness loop --list
  $ mira-harness loop --category generation --confirm
  $ mira-harness loop --catalog ./examples/catalog.sample.json
  $ mira-harness catalog --json
  $ mira-harness watch
  $ mira-harness report --category core --out report.md
  $ mira-harness stats
`,
);

// Bare `mira-harness` (no command) -> launch screen: banner + help. Done explicitly
// rather than via program.action(), which would swallow an unknown command as a
// program argument and exit 0 instead of erroring on the typo. -V / --help and every
// real command fall through to commander (which keeps its unknown-command error).
if (process.argv.length <= 2) {
  banner(version);
  program.outputHelp();
  process.exit(0);
}

program
  .parseAsync(process.argv)
  .then(() => process.exit(0)) // exit before GramJS's post-disconnect update poll logs a benign TIMEOUT
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
