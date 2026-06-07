/**
 * Thin GramJS (MTProto userbot) wrapper for the Mira experiment harness.
 *
 * Safety: this drives a REAL Telegram account, so every send goes through an
 * allowlist (assertAllowed) — it refuses to message anyone but @mira (and an
 * optional experiment chat). This is the guardrail against fat-fingering a
 * message to the wrong chat from your own account.
 */
import { TelegramClient, Api } from "telegram";
// Use explicit /index.js subpaths so the BUILT esm bin resolves them (Node ESM
// can't do bare directory imports like "telegram/sessions").
import { StringSession } from "telegram/sessions/index.js";
import { NewMessage, Raw } from "telegram/events/index.js";
import { Logger } from "telegram/extensions/index.js";
import { LogLevel } from "telegram/extensions/Logger.js";
// EditedMessage exists in events/index.d.ts but isn't re-exported by events/index.js
// (GramJS packaging quirk), so import it from its submodule directly.
import { EditedMessage } from "telegram/events/EditedMessage.js";
import type { NewMessageEvent } from "telegram/events/index.js";
import { tgEnv } from "./env.js";
import { extractMessage, type CapturedMessage, type ProbeResult } from "./capture.js";

export function allowedPeers(): string[] {
  const peers = [tgEnv.miraPeer];
  if (tgEnv.experimentChat) peers.push(tgEnv.experimentChat);
  return peers;
}

/** Refuse to send to anyone outside the allowlist (own-account safety). */
export function assertAllowed(peer: string): void {
  if (!allowedPeers().includes(peer)) {
    throw new Error(
      `peer "${peer}" not in allowlist [${allowedPeers().join(", ")}] — refusing to send`,
    );
  }
}

export async function connect(session: string): Promise<TelegramClient> {
  const client = new TelegramClient(new StringSession(session), tgEnv.apiId(), tgEnv.apiHash(), {
    connectionRetries: 5,
    // Silence GramJS's INFO chatter so the CLI's own output stays clean.
    baseLogger: new Logger(LogLevel.NONE),
  });
  await client.connect();
  // Touch self once so the client is fully initialized before resolving peers.
  await client.getMe();
  return client;
}

// getEntity is overloaded (single entity vs array); ReturnType can pick either
// overload across telegram versions, so pin to the single-entity element type.
type GetEntityResult = Awaited<ReturnType<TelegramClient["getEntity"]>>;
type ResolvedEntity = GetEntityResult extends readonly (infer U)[] ? U : GetEntityResult;

/**
 * Resolve a peer to an entity. Tries getEntity (ResolveUsername) first; for
 * @mira that fails (its `username` comes back null), so fall back to finding it
 * among existing dialogs by username or display name.
 */
export async function resolvePeer(client: TelegramClient, peer: string): Promise<ResolvedEntity> {
  try {
    return await client.getEntity(peer);
  } catch {
    const target = peer.toLowerCase().replace(/^@/, "");
    const dialogs = await client.getDialogs({ limit: 200 });
    for (const d of dialogs) {
      const e = d.entity;
      if (!e) continue;
      const username = "username" in e && e.username ? e.username.toLowerCase() : "";
      const name = (d.name ?? "").toLowerCase();
      if (username === target || name === target) return e;
    }
    throw new Error(`could not resolve peer "${peer}" — not in dialogs either`);
  }
}

export interface CollectOptions {
  /** Quiet period (ms) after the last new/edited message before we conclude. */
  settleMs?: number;
  /** Give up if @mira hasn't sent anything by this point (ms). */
  firstReplyTimeoutMs?: number;
  /** Hard ceiling (ms) — bounds streamed/edited replies and generation waits. */
  maxMs?: number;
  /** While @mira shows a "typing…" indicator, extend the no-reply wait to this (ms). */
  typingGraceMs?: number;
}

interface Targets {
  /** The conversation we act in (a DM with @mira, or an experiment group chat). */
  entity: ResolvedEntity;
  /** The sender we listen for — ALWAYS @mira (same as entity in a DM). */
  miraUser: ResolvedEntity;
  /** @mira's user id as a string (for the typing-indicator match). */
  peerId: string;
}

async function resolveTargets(client: TelegramClient, peer: string): Promise<Targets> {
  const entity = await resolvePeer(client, peer);
  // In a DM the conversation IS @mira; in a group resolve @mira separately.
  const miraUser = peer === tgEnv.miraPeer ? entity : await resolvePeer(client, tgEnv.miraPeer);
  return { entity, miraUser, peerId: miraUser.id.toString() };
}

/**
 * Arm the settle-window collector (handlers + timers, synchronously) and return
 * the promise of the full settled reply: all messages (multi-message replies) and
 * the final state of each edited message (streamed replies), with their buttons /
 * links / media. The CALLER triggers the action (send / click) after this returns
 * — handlers are already registered, so a fast reply can't be missed.
 */
function buildCollector(
  peer: string,
  client: TelegramClient,
  t: Targets,
  sent: string,
  opts: CollectOptions,
): Promise<ProbeResult> {
  const settleMs = opts.settleMs ?? 5_000;
  const firstReplyTimeoutMs = opts.firstReplyTimeoutMs ?? 60_000;
  const maxMs = opts.maxMs ?? 120_000;
  const typingGraceMs = opts.typingGraceMs ?? 45_000;
  const { peerId } = t;

  // Scope to THIS conversation (chats) AND @mira as the sender (fromUsers), so a
  // Mira message in some other chat can never bleed into this probe.
  // NB: `chats` is .toString()'d by GramJS's EventBuilder, so pass the numeric id
  // (a full entity would stringify to "[object Object]" and fail to resolve);
  // `fromUsers` is resolved via getInputEntity, so the entity object is fine there.
  const newEvent = new NewMessage({ chats: [t.entity.id], fromUsers: [t.miraUser] });
  const editEvent = new EditedMessage({ chats: [t.entity.id], fromUsers: [t.miraUser] });
  const rawEvent = new Raw({});

  // id -> latest message + how many edits we observed for it
  const collected = new Map<number, { msg: Api.Message; editCount: number }>();
  const start = Date.now();
  let firstReplyMs: number | null = null;

  return new Promise<ProbeResult>((resolve) => {
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    let firstTimer: ReturnType<typeof setTimeout> | undefined;
    let hardTimer: ReturnType<typeof setTimeout> | undefined;

    const newHandler = async (ev: NewMessageEvent): Promise<void> => onActivity(ev, false);
    const editHandler = async (ev: NewMessageEvent): Promise<void> => onActivity(ev, true);

    // Fallback for a slow Mira: while she shows a "typing…" indicator and nothing
    // has arrived yet, push the no-reply deadline out (still bounded by hardTimer).
    const rawHandler = async (update: Api.TypeUpdate): Promise<void> => {
      if (update.className !== "UpdateUserTyping") return;
      const u = update as Api.UpdateUserTyping;
      if (u.userId?.toString() !== peerId || firstReplyMs !== null) return;
      if (firstTimer) clearTimeout(firstTimer);
      firstTimer = setTimeout(finish, typingGraceMs);
    };

    const cleanup = (): void => {
      client.removeEventHandler(newHandler, newEvent);
      client.removeEventHandler(editHandler, editEvent);
      client.removeEventHandler(rawHandler, rawEvent);
      if (settleTimer) clearTimeout(settleTimer);
      if (firstTimer) clearTimeout(firstTimer);
      if (hardTimer) clearTimeout(hardTimer);
    };

    const finish = (): void => {
      cleanup();
      const messages = [...collected.values()]
        .sort((a, b) => a.msg.id - b.msg.id)
        .map(({ msg, editCount }) => extractMessage(msg, editCount));
      resolve({
        peer,
        sent,
        messages,
        firstReplyMs,
        totalMs: Date.now() - start,
        timedOut: messages.length === 0,
        ts: new Date().toISOString(),
      });
    };

    function onActivity(ev: NewMessageEvent, isEdit: boolean): void {
      const msg = ev.message;
      if (!msg) return;
      if (firstReplyMs === null) firstReplyMs = Date.now() - start;
      if (firstTimer) {
        clearTimeout(firstTimer);
        firstTimer = undefined;
      }
      const existing = collected.get(msg.id);
      if (existing) {
        existing.msg = msg;
        if (isEdit) existing.editCount += 1;
      } else {
        collected.set(msg.id, { msg, editCount: isEdit ? 1 : 0 });
      }
      // Re-arm the quiet timer on every activity.
      if (settleTimer) clearTimeout(settleTimer);
      settleTimer = setTimeout(finish, settleMs);
    }

    client.addEventHandler(newHandler, newEvent);
    client.addEventHandler(editHandler, editEvent);
    client.addEventHandler(rawHandler, rawEvent);
    firstTimer = setTimeout(finish, firstReplyTimeoutMs); // nothing arrived -> timeout
    hardTimer = setTimeout(finish, maxMs); // safety ceiling
  });
}

/**
 * Send `message` to `peer` and collect @mira's full settled reply.
 * One probe = one send + the full settled reply.
 */
export async function sendAndCollect(
  client: TelegramClient,
  peer: string,
  message: string,
  opts: CollectOptions = {},
): Promise<ProbeResult> {
  assertAllowed(peer);
  const t = await resolveTargets(client, peer);
  // Arm the collector synchronously, THEN send.
  const result = buildCollector(peer, client, t, message, opts);
  await client.sendMessage(t.entity, { message });
  return result;
}

/**
 * Press an inline CALLBACK button on a prior @mira message (by message id + the
 * button's callback data) and collect whatever @mira sends next. This is the only
 * "interaction" the harness does — used to confirm credit-gated generation. The
 * runner gates it behind both a catalog flag and a CLI opt-in, and NEVER targets
 * wallet/OAuth/transfer buttons.
 */
export async function clickAndCollect(
  client: TelegramClient,
  peer: string,
  msgId: number,
  data: Buffer,
  opts: CollectOptions = {},
): Promise<ProbeResult> {
  assertAllowed(peer);
  const t = await resolveTargets(client, peer);
  const result = buildCollector(peer, client, t, `[click callback on msg ${msgId}]`, opts);
  await client.invoke(new Api.messages.GetBotCallbackAnswer({ peer: t.entity, msgId, data }));
  return result;
}

/**
 * Stream @mira's messages in `peer` (observe-only, no send). Calls `onMessage` for
 * each new or edited message, scoped to this conversation + @mira as the sender.
 * Returns an unsubscribe function. Used by `mira-harness watch`.
 */
export async function subscribe(
  client: TelegramClient,
  peer: string,
  onMessage: (m: CapturedMessage, kind: "new" | "edit") => void,
): Promise<() => void> {
  assertAllowed(peer);
  const t = await resolveTargets(client, peer);
  const newEvent = new NewMessage({ chats: [t.entity.id], fromUsers: [t.miraUser] });
  const editEvent = new EditedMessage({ chats: [t.entity.id], fromUsers: [t.miraUser] });
  const onNew = async (ev: NewMessageEvent): Promise<void> => {
    if (ev.message) onMessage(extractMessage(ev.message, 0), "new");
  };
  const onEdit = async (ev: NewMessageEvent): Promise<void> => {
    if (ev.message) onMessage(extractMessage(ev.message, 1), "edit");
  };
  client.addEventHandler(onNew, newEvent);
  client.addEventHandler(onEdit, editEvent);
  return () => {
    client.removeEventHandler(onNew, newEvent);
    client.removeEventHandler(onEdit, editEvent);
  };
}
