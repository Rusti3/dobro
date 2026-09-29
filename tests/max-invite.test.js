import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { artworkForEvent, themeArtwork } from "../shared/theme-artwork.js";
import { inviteMessageBody, sendInviteMessage } from "../server/max.js";

test("every interest has supplied artwork", () => {
  assert.equal(Object.keys(themeArtwork).length, 14);
  for (const image of Object.values(themeArtwork))
    assert.ok(fs.existsSync(new URL(`../public${image}`, import.meta.url)), `${image} is missing`);
  assert.equal(artworkForEvent({ theme: "animals" }), "/theme-images/animals.jpg");
  assert.equal(artworkForEvent({ themes: ["education"] }), "/theme-images/education.jpg");
  assert.equal(artworkForEvent({ theme: "unknown" }), "/theme-images/charity.jpg");
});

test("MAX invitation contains picture, event, owner and mini-app link without generic link preview", async () => {
  const code = "a".repeat(36);
  const options = {
    ownerName: "Анна", event: { theme: "animals", short: "Помочь приюту", image: "/images/11013932.jpg" }, code,
    botUsername: "@helpi_bot", appUrl: "https://helpi.example",
  };
  const body = inviteMessageBody(options);
  assert.match(body.text, /Анна зовёт тебя/);
  assert.match(body.text, /Помочь приюту/);
  assert.match(body.text, new RegExp(`https://max\\.ru/helpi_bot\\?startapp=i_${code}`));
  assert.deepEqual(body.attachments, [{ type: "image", payload: { url: "https://helpi.example/images/11013932.jpg" } }]);
  assert.equal(body.notify, false);
  let sent;
  const mid = await sendInviteMessage("bot-token", "12345", options, async (...args) => {
    sent = args;
    return { message: { body: { mid: "mid.test123" } } };
  });
  assert.equal(mid, "mid.test123");
  assert.equal(sent[1], "/messages");
  assert.deepEqual(sent[2].query, { user_id: "12345", disable_link_preview: true });
  assert.deepEqual(sent[2].payload, body);
  await assert.rejects(
    sendInviteMessage("bot-token", "12345", options, async () => ({ message: {} })),
    /идентификатор/,
  );
});

test("MAX invitation keeps the actual remote event photo and never substitutes topic artwork", () => {
  const base = { ownerName: "Анна", code: "b".repeat(36), botUsername: "helpi_bot", appUrl: "https://helpi.example" };
  assert.deepEqual(inviteMessageBody({ ...base, event: { short: "Дело", image: "https://dobro.example/photo.webp" } }).attachments,
    [{ type: "image", payload: { url: "https://dobro.example/photo.webp" } }]);
  assert.equal(inviteMessageBody({ ...base, event: { short: "Дело", theme: "animals", image: null } }).attachments, undefined);
  assert.equal(inviteMessageBody({ ...base, event: { short: "Дело", image: "javascript:alert(1)" } }).attachments, undefined);
});
