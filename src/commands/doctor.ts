/**
 * Preflight checks: env vars, session, connectivity, and @mira resolution.
 *
 *   mira-harness doctor
 *
 * Read-only — it never sends a message. Exit 0 if all checks pass, 1 otherwise.
 */
import { tgEnv } from "../env.js";
import { connect, resolvePeer } from "../client.js";
import { c, note, mascot } from "../ui.js";

export async function doctor(): Promise<void> {
  const pass = (m: string): void => note(`${c.green("✔")} ${m}`);
  const fail = (m: string): void => note(`${c.red("✗")} ${m}`);

  // 1. API credentials
  let apiOk = true;
  try {
    tgEnv.apiId();
    tgEnv.apiHash();
    pass("TG_API_ID / TG_API_HASH present");
  } catch (e) {
    apiOk = false;
    fail(e instanceof Error ? e.message : String(e));
  }

  // 2. Session
  const session = tgEnv.session();
  if (session) pass("TG_SESSION present");
  else fail("TG_SESSION is empty — run `mira-harness login`");

  if (!apiOk || !session) {
    if (process.stderr.isTTY) {
      note("");
      for (const l of mascot("sad")) note(c.red(l));
    }
    note(c.yellow("\nFix .env, then re-run `mira-harness doctor`."));
    process.exit(1);
  }

  // 3. Connect + identify + resolve @mira
  let ok = true;
  try {
    const client = await connect(session);
    try {
      const me = (await client.getMe()) as { username?: string; id?: { toString(): string } };
      pass(`connected as @${me.username ?? "?"} (id ${me.id?.toString() ?? "?"})`);
      try {
        const mira = (await resolvePeer(client, tgEnv.miraPeer)) as { id?: { toString(): string } };
        pass(`resolved target @${tgEnv.miraPeer} (id ${mira.id?.toString() ?? "?"})`);
      } catch (e) {
        ok = false;
        fail(`could not resolve @${tgEnv.miraPeer}: ${e instanceof Error ? e.message : e}`);
      }
    } finally {
      await client.disconnect();
    }
  } catch (e) {
    ok = false;
    fail(`connect failed: ${e instanceof Error ? e.message : e}`);
  }

  if (process.stderr.isTTY) {
    note("");
    const paint = ok ? c.green : c.red;
    for (const l of mascot(ok ? "happy" : "sad")) note(paint(l));
  }
  note(ok ? c.green("\nAll checks passed.") : c.red("\nSome checks failed."));
  process.exit(ok ? 0 : 1);
}
