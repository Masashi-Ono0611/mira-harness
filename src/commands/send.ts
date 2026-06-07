/**
 * One probe: send a message to @mira and print the FULL settled reply as JSON
 * (all messages + edits + buttons/links/media), and append it to the run log.
 *
 *   mira-harness send "your message to @mira"
 *
 * Kill switch: create a file named STOP_MIRA in the cwd to block sends.
 */
import { existsSync } from "node:fs";
import { tgEnv } from "../env.js";
import { connect, sendAndCollect } from "../client.js";
import { appendRun } from "../log.js";

const STOP_FILE = "STOP_MIRA";

export async function send(message: string): Promise<void> {
  if (!message.trim()) {
    console.error('usage: mira-harness send "<message to @mira>"');
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

  const peer = tgEnv.miraPeer;
  const client = await connect(session);
  try {
    const result = await sendAndCollect(client, peer, message);
    await appendRun(result);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await client.disconnect();
  }
}
