/**
 * Live-tail @mira's messages (observe-only — sends nothing). Ctrl-C to stop.
 *
 *   mira-harness watch
 *   mira-harness watch --peer experiment
 *
 * Prints each new/edited message from @mira with its buttons/links/media as it
 * arrives — handy while you poke at @mira by hand in Telegram.
 */

import type { CapturedMessage } from "../capture.js";
import { connect, subscribe } from "../client.js";
import { tgEnv } from "../env.js";
import { c, note } from "../ui.js";

export interface WatchOptions {
  peer?: string;
}

function line(peer: string, m: CapturedMessage, kind: "new" | "edit"): string {
  const ts = new Date().toLocaleTimeString();
  const tag = kind === "edit" ? c.yellow("edit") : c.green("new");
  const extras = [
    m.buttons.length ? `${m.buttons.length}btn` : "",
    m.links.length ? `${m.links.length}link` : "",
    m.media ? c.magenta(`media=${m.media.kind}`) : "",
  ]
    .filter(Boolean)
    .join(" ");
  const text = m.text.replace(/\s+/g, " ").trim().slice(0, 160) || "(no text)";
  return `${c.dim(ts)} ${tag} ${c.cyan(`@${peer}`)}: ${text}${extras ? `  ${extras}` : ""}`;
}

export async function watch(opts: WatchOptions = {}): Promise<void> {
  const session = tgEnv.session();
  if (!session) {
    console.error("TG_SESSION is empty — run `mira-harness login` first, then put it in .env.");
    process.exit(1);
  }
  let peer = tgEnv.miraPeer;
  if (opts.peer === "experiment" || opts.peer === "group") {
    if (!tgEnv.experimentChat) {
      console.error("--peer experiment requires TG_EXPERIMENT_CHAT in .env (a group chat with @mira).");
      process.exit(1);
    }
    peer = tgEnv.experimentChat;
  } else if (opts.peer) {
    peer = opts.peer;
  }

  const client = await connect(session);
  const unsubscribe = await subscribe(client, peer, (m, kind) => note(line(peer, m, kind)));
  note(c.bold(`watching @${peer} — Ctrl-C to stop`));

  await new Promise<void>((resolve) => {
    process.once("SIGINT", () => {
      note(c.dim("\nstopping…"));
      resolve();
    });
  });
  unsubscribe();
  await client.disconnect();
}
