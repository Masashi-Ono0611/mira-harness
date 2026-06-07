/**
 * mira-harness — automated probe harness for the @mira Telegram bot.
 *
 * Drives a Telegram userbot (GramJS) so you can message @mira, capture the FULL
 * reply (buttons / links / media / edits), and run a self-driving experiment
 * catalog — no screenshots, no copy-paste.
 */
import { Command } from "commander";
import { CATEGORIES } from "./catalog.js";
import { login } from "./commands/login.js";
import { send } from "./commands/send.js";
import { loop } from "./commands/loop.js";
import { report } from "./commands/report.js";

const program = new Command();

program
  .name("mira-harness")
  .description("Automated probe harness for the @mira Telegram bot (GramJS userbot).")
  .version("0.1.0");

program
  .command("login")
  .description("One-time interactive login -> prints TG_SESSION for .env")
  .action(login);

program
  .command("send")
  .description("Send one probe to @mira and print the full settled reply as JSON")
  .argument("<message...>", "the message to send (quote it or pass words)")
  .action(async (parts: string[]) => {
    await send(parts.join(" "));
  });

program
  .command("loop")
  .description("Run the experiment catalog against @mira at a human pace")
  .option("-c, --category <category>", `only this category (${CATEGORIES.join(" | ")})`)
  .option("-m, --max <n>", "max probes this run", "6")
  .option("--confirm", "press a safe ✅ Confirm on generation probes (spends credits)", false)
  .option("--peer <peer>", "'experiment'|'group' for TG_EXPERIMENT_CHAT, or a literal allowlisted peer")
  .action(async (opts: { category?: string; max: string; confirm: boolean; peer?: string }) => {
    await loop({
      category: opts.category,
      max: Number(opts.max),
      confirm: opts.confirm,
      peer: opts.peer,
    });
  });

program
  .command("report")
  .description("Distill the run log (JSONL) into a Markdown report")
  .option("--in <file>", "input JSONL (default: the run log)")
  .option("--out <file>", "write to a file instead of stdout")
  .action((opts: { in?: string; out?: string }) => {
    report({ in: opts.in, out: opts.out });
  });

program
  .parseAsync(process.argv)
  .then(() => process.exit(0)) // exit before GramJS's post-disconnect update poll logs a benign TIMEOUT
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
