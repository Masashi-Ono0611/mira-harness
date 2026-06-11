#!/usr/bin/env node
/**
 * mira-harness — automated probe harness for the @mira Telegram bot.
 *
 * Drives a Telegram userbot (GramJS) so you can message @mira, capture the FULL
 * reply (buttons / links / media / edits), and run a self-driving experiment
 * catalog — no screenshots, no copy-paste.
 */
import { Command } from "commander";
import { type Expect, ExpectSchema } from "./assert.js";
import { CATEGORIES } from "./catalog.js";
import { assertLog } from "./commands/assert.js";
import { listCatalog } from "./commands/catalog.js";
import { diff } from "./commands/diff.js";
import { doctor } from "./commands/doctor.js";
import { login } from "./commands/login.js";
import { loop } from "./commands/loop.js";
import { report } from "./commands/report.js";
import { schema } from "./commands/schema.js";
import { send } from "./commands/send.js";
import { stats } from "./commands/stats.js";
import { watch } from "./commands/watch.js";
import { banner, c } from "./ui.js";
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

/** Build an Expect from the `send --expect-*` flags (validated by the schema). */
function buildSendExpect(o: {
  expectReply?: boolean;
  expectJson?: boolean;
  expectText?: string;
  expectMinLinks?: string;
  expectMinButtons?: string;
  expectWebapp?: boolean;
  expectMedia?: string;
  expectMaxMs?: string;
}): Expect | undefined {
  const raw: Record<string, unknown> = {};
  if (o.expectReply) raw.replies = true;
  if (o.expectJson) raw.json = true;
  if (o.expectText !== undefined) raw.textMatches = o.expectText;
  if (o.expectMinLinks !== undefined) raw.minLinks = posInt("expect-min-links", o.expectMinLinks);
  if (o.expectMinButtons !== undefined) raw.minButtons = posInt("expect-min-buttons", o.expectMinButtons);
  if (o.expectWebapp) raw.hasWebApp = true;
  if (o.expectMedia !== undefined) raw.media = o.expectMedia;
  if (o.expectMaxMs !== undefined) raw.maxFirstReplyMs = ms("expect-max-ms", o.expectMaxMs);
  if (!Object.keys(raw).length) return undefined;
  const parsed = ExpectSchema.safeParse(raw);
  if (!parsed.success) {
    console.error(`invalid --expect-* value: ${parsed.error.issues[0]?.message ?? "schema error"}`);
    process.exit(1);
  }
  return parsed.data;
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
  .option("--expect-reply", "assert a reply arrives (any --expect-* exits 1 on failure)")
  .option("--expect-json", "assert the first reply text is valid JSON")
  .option("--expect-text <regex>", "assert some reply text matches this regex (case-insensitive)")
  .option("--expect-min-links <n>", "assert at least N links across the reply")
  .option("--expect-min-buttons <n>", "assert at least N inline buttons")
  .option("--expect-webapp", "assert a web_app/startapp Launch button is present")
  .option("--expect-media <kind>", "assert media of this kind (photo|video|audio|document|webpage)")
  .option("--expect-max-ms <ms>", "assert the first reply arrives within this many ms")
  .action(
    async (
      parts: string[],
      opts: {
        quiet: boolean;
        settle?: string;
        timeout?: string;
        log: boolean;
        expectReply?: boolean;
        expectJson?: boolean;
        expectText?: string;
        expectMinLinks?: string;
        expectMinButtons?: string;
        expectWebapp?: boolean;
        expectMedia?: string;
        expectMaxMs?: string;
      },
    ) => {
      await send(parts.join(" "), {
        quiet: opts.quiet,
        settle: ms("settle", opts.settle),
        timeout: ms("timeout", opts.timeout),
        noLog: opts.log === false,
        expect: buildSendExpect(opts),
      });
    },
  );

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
  .option("--grep <pattern>", "run only probes whose id matches this regex (case-insensitive)")
  .option("--only <ids>", "run only probes with these comma-separated ids (exact match)")
  .option("--no-fail", "report failed assertions but still exit 0 (default: exit 1 on failure)")
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
      grep?: string;
      only?: string;
      fail: boolean;
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
        grep: opts.grep,
        only: opts.only,
        noFail: opts.fail === false,
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

program
  .command("diff")
  .description("Compare two run logs for @mira behavioral drift (exit 1 on a regression)")
  .argument("<baseline>", "baseline run log (JSONL)")
  .argument("[current]", "current run log (JSONL); defaults to the run log")
  .option("--json", "output the drift as JSON", false)
  .option("--no-fail", "report regressions but still exit 0")
  .action((baseline: string, current: string | undefined, opts: { json: boolean; fail: boolean }) => {
    diff({ baseline, current, json: opts.json, noFail: !opts.fail });
  });

program
  .command("assert")
  .description("Re-grade a saved run log against a catalog's `expect` (offline; exit 1 on failure)")
  .option("--in <file>", "input JSONL (default: the run log)")
  .option("--catalog <file>", "catalog with expectations (default: the built-in catalog)")
  .option("-c, --category <category>", "only include probes from this category")
  .option("--json", "output the results as JSON", false)
  .option("--no-fail", "report failures but still exit 0")
  .action((opts: { in?: string; catalog?: string; category?: string; json: boolean; fail: boolean }) => {
    assertLog({ in: opts.in, catalog: opts.catalog, category: opts.category, json: opts.json, noFail: !opts.fail });
  });

program
  .command("schema")
  .description("Print the JSON Schema for a custom catalog file (editor autocomplete / validation)")
  .option("--out <file>", "write to a file instead of stdout")
  .action((opts: { out?: string }) => {
    schema({ out: opts.out });
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
  $ mira-harness diff baseline.jsonl
  $ mira-harness loop --grep core-json
  $ mira-harness assert
  $ mira-harness schema > catalog.schema.json
`,
);

// Bare `mira-harness` (no command) -> a CONCISE launch screen (banner + one-screen
// summary), not the full help — `--help` / `<command> --help` stay comprehensive.
// Done explicitly rather than via program.action(), which would swallow an unknown
// command as a program argument and exit 0 instead of erroring on the typo. -V /
// --help and every real command fall through to commander (keeps unknown-cmd error).
if (process.argv.length <= 2) {
  banner(version);
  console.log("  Drive @mira from your terminal — QA, learn, and assert on its behavior.\n");
  console.log(`  Commands  ${c.cyan("login · doctor · send · loop · catalog · watch")}`);
  console.log(`            ${c.cyan("report · stats · diff · assert · schema")}\n`);
  console.log(
    `  Run ${c.bold("mira-harness --help")} for options + examples, or ${c.bold("mira-harness <command> --help")}.`,
  );
  process.exit(0);
}

program
  .parseAsync(process.argv)
  .then(() => process.exit(0)) // exit before GramJS's post-disconnect update poll logs a benign TIMEOUT
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
