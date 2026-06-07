/**
 * Unit tests for capture.ts — pure, no network, no Telegram. Run: `npm test`.
 *
 * Fixtures are plain objects shaped like GramJS Api types (className + fields)
 * and cast through `unknown`, which is exactly how the extractors read them at
 * runtime (by `.className`). This proves the capture fidelity — buttons (web_app
 * / startapp), source links, and media — without messaging @mira.
 */
import assert from "node:assert/strict";
import type { Api } from "telegram";
import { extractButtons, extractLinks, extractMedia, extractMessage } from "../src/capture.js";

// 1. links: a text_url (source link) + a bare url
{
  const text = "STON $0.536 via STON.fi — more at https://ston.fi/news";
  const entities = [
    {
      className: "MessageEntityTextUrl",
      offset: text.indexOf("STON.fi"),
      length: "STON.fi".length,
      url: "https://ston.fi",
    },
    {
      className: "MessageEntityUrl",
      offset: text.indexOf("https://ston.fi/news"),
      length: "https://ston.fi/news".length,
    },
  ];
  const links = extractLinks(text, entities as unknown as Api.TypeMessageEntity[]);
  assert.equal(links.length, 2);
  assert.deepEqual(links[0], { text: "STON.fi", url: "https://ston.fi" });
  assert.equal(links[1].url, "https://ston.fi/news");
}

// 2. buttons: Mini App "Launch" (web_app/startapp) + url + callback
{
  const markup = {
    className: "ReplyInlineMarkup",
    rows: [
      {
        buttons: [
          {
            className: "KeyboardButtonWebView",
            text: "Launch",
            url: "https://t.me/tribemind_bot?startapp=STON_USDT_10",
          },
          { className: "KeyboardButtonUrl", text: "Docs", url: "https://wiki.mira.tg" },
        ],
      },
      { buttons: [{ className: "KeyboardButtonCallback", text: "Yes", data: Buffer.from("yes") }] },
    ],
  };
  const buttons = extractButtons(markup as unknown as Api.TypeReplyMarkup);
  assert.equal(buttons.length, 3);
  assert.equal(buttons[0].webAppUrl, "https://t.me/tribemind_bot?startapp=STON_USDT_10");
  assert.equal(buttons[0].url, undefined);
  assert.equal(buttons[1].url, "https://wiki.mira.tg");
  assert.equal(buttons[2].callbackData, Buffer.from("yes").toString("base64"));
}

// 3. non-inline markup yields no buttons
{
  assert.deepEqual(
    extractButtons({ className: "ReplyKeyboardMarkup" } as unknown as Api.TypeReplyMarkup),
    [],
  );
}

// 4. media: photo, document(video mime -> kind=video), webpage url
{
  assert.equal(
    extractMedia({ className: "MessageMediaPhoto" } as unknown as Api.TypeMessageMedia)?.kind,
    "photo",
  );
  const doc = {
    className: "MessageMediaDocument",
    document: {
      className: "Document",
      mimeType: "video/mp4",
      attributes: [{ className: "DocumentAttributeFilename", fileName: "clip.mp4" }],
    },
  };
  const m = extractMedia(doc as unknown as Api.TypeMessageMedia);
  assert.equal(m?.kind, "video");
  assert.equal(m?.fileName, "clip.mp4");
  const wp = { className: "MessageMediaWebPage", webpage: { className: "WebPage", url: "https://ston.fi" } };
  assert.equal(extractMedia(wp as unknown as Api.TypeMessageMedia)?.url, "https://ston.fi");
}

// 5. extractMessage: integration + editCount passthrough
{
  const msg = {
    id: 99,
    message: "here you go",
    media: { className: "MessageMediaPhoto" },
  };
  const cap = extractMessage(msg as unknown as Api.Message, 3);
  assert.equal(cap.id, 99);
  assert.equal(cap.text, "here you go");
  assert.equal(cap.editCount, 3);
  assert.equal(cap.media?.kind, "photo");
  assert.deepEqual(cap.buttons, []);
  assert.deepEqual(cap.links, []);
}

console.log("capture.test.ts: all assertions passed ✅");
