/**
 * Pure extraction: GramJS `Api.Message` -> a flat, JSON-serializable record of
 * everything @mira put in a reply. NO network here, so this is unit-testable.
 *
 * Why this matters: the *interesting* Mira behaviors live OUTSIDE the plain text
 * — Mini App "Launch" cards (web_app / startapp deep links), deep-research source
 * links (text_url entities), generated media. The old harness grabbed only the
 * first message's `.message` string and dropped all of that. These extractors
 * pull it back so a probe captures Mira's full surface.
 */
import { Api } from "telegram";

/** An inline-keyboard button, flattened to the bits we care about. */
export interface CapturedButton {
  text: string;
  /** KeyboardButtonUrl / KeyboardButtonUrlAuth */
  url?: string;
  /** KeyboardButtonWebView / KeyboardButtonSimpleWebView — the Mini App "Launch" target. */
  webAppUrl?: string;
  /** KeyboardButtonCallback payload, base64 (rarely human-readable). */
  callbackData?: string;
}

/** A hyperlink found in the message text (entities). */
export interface CapturedLink {
  /** The visible text the link is attached to (text_url) — omitted for bare urls. */
  text?: string;
  url: string;
}

export interface CapturedMedia {
  kind: "photo" | "video" | "audio" | "document" | "webpage" | "other";
  /** webpage url, when the media is a link preview. */
  url?: string;
  mime?: string;
  fileName?: string;
}

/** One message (or its final edited state) from @mira. */
export interface CapturedMessage {
  id: number;
  text: string;
  /** How many edits we observed (0 = sent once, never edited). */
  editCount: number;
  buttons: CapturedButton[];
  links: CapturedLink[];
  media?: CapturedMedia;
}

/** The full result of one probe = one send + everything @mira sent back. */
export interface ProbeResult {
  peer: string;
  sent: string;
  messages: CapturedMessage[];
  /** ms from send to the first reply message (null if nothing arrived). */
  firstReplyMs: number | null;
  /** ms from send until the reply settled (or the cap was hit). */
  totalMs: number;
  /** true if we gave up waiting for a first reply. */
  timedOut: boolean;
  ts: string;
}

/** Telegram entity offsets/lengths are UTF-16 code units — JS substring matches. */
function sliceText(text: string, offset: number, length: number): string {
  return text.substring(offset, offset + length);
}

export function extractLinks(text: string, entities?: Api.TypeMessageEntity[]): CapturedLink[] {
  if (!entities?.length) return [];
  const links: CapturedLink[] = [];
  for (const e of entities) {
    if (e.className === "MessageEntityTextUrl") {
      const te = e as Api.MessageEntityTextUrl;
      links.push({ text: sliceText(text, te.offset, te.length), url: te.url });
    } else if (e.className === "MessageEntityUrl") {
      const ue = e as Api.MessageEntityUrl;
      links.push({ url: sliceText(text, ue.offset, ue.length) });
    }
  }
  return links;
}

function extractButton(btn: Api.TypeKeyboardButton): CapturedButton | undefined {
  switch (btn.className) {
    case "KeyboardButtonUrl":
      return { text: btn.text, url: (btn as Api.KeyboardButtonUrl).url };
    case "KeyboardButtonUrlAuth":
      return { text: btn.text, url: (btn as Api.KeyboardButtonUrlAuth).url };
    case "KeyboardButtonWebView":
      return { text: btn.text, webAppUrl: (btn as Api.KeyboardButtonWebView).url };
    case "KeyboardButtonSimpleWebView":
      return { text: btn.text, webAppUrl: (btn as Api.KeyboardButtonSimpleWebView).url };
    case "KeyboardButtonCallback": {
      const cb = btn as Api.KeyboardButtonCallback;
      return { text: btn.text, callbackData: Buffer.from(cb.data).toString("base64") };
    }
    default:
      return undefined; // plain KeyboardButton etc. — nothing actionable to capture
  }
}

export function extractButtons(markup?: Api.TypeReplyMarkup): CapturedButton[] {
  // Only inline keyboards carry urls / web_app targets.
  if (!markup || markup.className !== "ReplyInlineMarkup") return [];
  const out: CapturedButton[] = [];
  for (const row of markup.rows) {
    for (const btn of row.buttons) {
      const b = extractButton(btn);
      if (b) out.push(b);
    }
  }
  return out;
}

export function extractMedia(media?: Api.TypeMessageMedia): CapturedMedia | undefined {
  if (!media) return undefined;
  switch (media.className) {
    case "MessageMediaPhoto":
      return { kind: "photo" };
    case "MessageMediaDocument": {
      const doc = (media as Api.MessageMediaDocument).document;
      if (!doc || doc.className !== "Document") return { kind: "document" };
      const mime = doc.mimeType ?? "";
      const nameAttr = doc.attributes.find((a) => a.className === "DocumentAttributeFilename") as
        | Api.DocumentAttributeFilename
        | undefined;
      let kind: CapturedMedia["kind"] = "document";
      if (mime.startsWith("video/")) kind = "video";
      else if (mime.startsWith("audio/")) kind = "audio";
      else if (mime.startsWith("image/")) kind = "photo";
      return { kind, mime, fileName: nameAttr?.fileName };
    }
    case "MessageMediaWebPage": {
      const wp = (media as Api.MessageMediaWebPage).webpage;
      return { kind: "webpage", url: wp.className === "WebPage" ? wp.url : undefined };
    }
    default:
      return { kind: "other" };
  }
}

/**
 * Flatten one message into a CapturedMessage. `editCount` is supplied by the
 * collector (it tracks how many edits it saw for this id), defaulting to 0.
 */
export function extractMessage(msg: Api.Message, editCount = 0): CapturedMessage {
  const text = msg.message ?? "";
  const media = extractMedia(msg.media);
  return {
    id: msg.id,
    text,
    editCount,
    buttons: extractButtons(msg.replyMarkup),
    links: extractLinks(text, msg.entities),
    ...(media ? { media } : {}),
  };
}
