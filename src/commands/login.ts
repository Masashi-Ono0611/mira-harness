/**
 * One-time interactive login to mint a reusable StringSession.
 *
 *   mira-harness login
 *
 * Telegram sends a code to your app; enter it here. Put the printed TG_SESSION in
 * .env and every later run reconnects headlessly. The session string grants FULL
 * access to your account — keep it secret, never commit it.
 */
import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import { Logger } from "telegram/extensions/index.js";
import { LogLevel } from "telegram/extensions/Logger.js";
import { createInterface } from "node:readline/promises";
import { tgEnv } from "../env.js";

export async function login(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ask = async (q: string): Promise<string> => (await rl.question(q)).trim();

  const client = new TelegramClient(new StringSession(""), tgEnv.apiId(), tgEnv.apiHash(), {
    connectionRetries: 5,
    baseLogger: new Logger(LogLevel.NONE),
  });

  await client.start({
    phoneNumber: () => ask("Phone number (international, e.g. +8190...): "),
    password: () => ask("2FA password (leave blank if none): "),
    phoneCode: () => ask("Login code from Telegram: "),
    onError: (e) => console.error("login error:", e),
  });
  rl.close();

  console.log("\n=== Logged in. Add this line to .env (keep it SECRET) ===\n");
  console.log(`TG_SESSION=${client.session.save()}`);
  console.log("\nThis string grants full access to your account. Never commit it.\n");
  await client.disconnect();
}
