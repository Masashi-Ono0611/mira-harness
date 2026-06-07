/**
 * Environment for the Mira harness. Reads `.env` (see `.env.example`).
 *
 * The harness drives a Telegram USER account (GramJS / MTProto, a "userbot") so it
 * can message @mira and read its replies — a Telegram *bot* cannot read another
 * bot's messages (server-side rule), so a userbot is the only viable path.
 */
import "dotenv/config";

function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name} (see .env.example)`);
  return v;
}

export const tgEnv = {
  apiId: (): number => Number(req("TG_API_ID")),
  apiHash: (): string => req("TG_API_HASH"),
  /** Empty until `mira-harness login` mints it; required by send/loop. */
  session: (): string => process.env.TG_SESSION ?? "",
  /** Send allowlist: the target bot username (no @). Default @mira. */
  miraPeer: process.env.MIRA_PEER ?? "mira",
  /** Optional extra allowed peer (e.g. a group chat id) for `--peer experiment`. */
  experimentChat: process.env.TG_EXPERIMENT_CHAT || undefined,
};
