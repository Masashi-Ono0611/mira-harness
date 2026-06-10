/**
 * One probe: send a message to @mira and print the FULL settled reply as JSON
 * (all messages + edits + buttons/links/media), and append it to the run log.
 *
 *   mira-harness send "your message to @mira"
 *   echo "STON_USDT_10" | mira-harness send       # message via stdin
 *
 * Kill switch: create a file named STOP_MIRA in the cwd to block sends.
 */
import { existsSync } from "node:fs";
import { tgEnv } from "../env.js";
import { connect, sendAndCollect, type CollectOptions } from "../client.js";
import { appendRun } from "../log.js";
import { c, note, withProgress } from "../ui.js";

const STOP_FILE = "STOP_MIRA";

async function readStdin(): Promise<string> {
  if (process.stdin.isTTY) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8").trim();
}

export interface SendOptions {
  quiet?: boolean;
  settle?: number;
  timeout?: number;
  /** Skip appending the result to the run log. */
  noLog?: boolean;
}

export async function send(rawMessage: string, opts: SendOptions = {}): Promise<void> {
  const message = rawMessage.trim() || (await readStdin());
  if (!message) {
    console.error('usage: mira-harness send "<message>"  (or pipe the message via stdin)');
    process.exit(1);
  }
  if (existsSync(STOP_FILE)) {
    console.error(`${STOP_FILE} present — kill switch active, aborting.`);
    process.exit(2);
  }

  const session = tgEnv.session();
  if (!session) {
    console.error("TG_SESSION is empty — run `mira-harness login` first, then put it in .env.");
    process.exit(1);
  }

  const collect: CollectOptions = {};
  if (opts.settle !== undefined) collect.settleMs = opts.settle;
  if (opts.timeout !== undefined) collect.firstReplyTimeoutMs = opts.timeout;

  const peer = tgEnv.miraPeer;
  const client = await connect(session);
  try {
    const result = await withProgress(
      `@${peer}`,
      () => sendAndCollect(client, peer, message, collect),
      opts.quiet,
    );
    if (!opts.noLog) await appendRun(result);
    if (!opts.quiet) {
      note(
        result.timedOut
          ? c.yellow("no reply (timed out)")
          : c.green(`${result.messages.length} message(s) · first reply ${((result.firstReplyMs ?? 0) / 1000).toFixed(1)}s`),
      );
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.disconnect();
  }
}
