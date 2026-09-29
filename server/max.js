import fs from "node:fs";
import https from "node:https";
import tls from "node:tls";
import { URL } from "node:url";
import { miniAppButton, botMessageBody, botRecommendations, dailyDigestPanel } from "./bot-service.js";

export const MAX_API_URL = "https://platform-api2.max.ru";
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function caBundle() {
  const file = process.env.MAX_CA_BUNDLE || new URL("../russiantrustedca.pem", import.meta.url);
  try { return [...tls.rootCertificates, fs.readFileSync(file, "utf8")]; } catch { return undefined; }
}

function request(token, path, { method = "GET", query, payload } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(MAX_API_URL + path);
    for (const [key, value] of Object.entries(query || {})) if (value !== undefined && value !== null) url.searchParams.set(key, value);
    const body = payload === undefined ? null : Buffer.from(JSON.stringify(payload));
    const req = https.request(url, {
      method,
      ca: caBundle(),
      timeout: 40000,
      headers: {
        Accept: "application/json",
        Authorization: token,
        ...(body ? { "Content-Type": "application/json", "Content-Length": body.length } : {}),
      },
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        let data = {};
        try { if (raw) data = JSON.parse(raw); } catch { reject(new Error("MAX API вернул некорректный JSON")); return; }
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`MAX API HTTP ${res.statusCode}: ${data.message || data.error || raw || res.statusMessage}`));
          return;
        }
        resolve(data);
      });
    });
    req.on("timeout", () => req.destroy(new Error("Таймаут MAX API")));
    req.on("error", (error) => reject(error));
    if (body) req.write(body);
    req.end();
  });
}

export async function maxCall(token, path, options = {}) {
  if (!token?.trim()) throw new Error("MAX_BOT_TOKEN не задан.");
  try { return await request(token.trim(), path, options); }
  catch (error) {
    if (/certificate|unable to verify/i.test(String(error)))
      throw new Error("Не удалось проверить сертификат MAX. Проверьте russiantrustedca.pem или MAX_CA_BUNDLE.");
    throw error;
  }
}

export function updateUser(update) {
  const message = update?.message || update?.callback?.message || {};
  const sender = update?.callback?.user || update?.user || message.sender || {};
  const recipient = message.recipient || {};
  if (sender.is_bot || sender.user_id == null) return null;
  const destination = recipient.chat_id != null
    ? { kind: "chat_id", id: recipient.chat_id }
    : { kind: "user_id", id: sender.user_id };
  return { sender, destination, message };
}

export function appButton({ text, botUsername, appUrl, payload = "" }) {
  if (botUsername && payload === "tab_map") {
    const bot = botUsername.replace(/^@/, "");
    return { type: "link", text, url: `https://max.ru/${bot}?startapp=tab_map` };
  }
  if (botUsername) return { type: "open_app", text, web_app: botUsername.replace(/^@/, ""), ...(payload ? { payload } : {}) };
  return { type: "link", text, url: appUrl };
}

export async function sendMessage(token, destination, text, { botUsername, appUrl, payload } = {}) {
  const buttonText = payload === "tab_map" ? "Открыть карту" : "Открыть «хелпи»";
  const attachments = appUrl ? [{ type: "inline_keyboard", payload: { buttons: [[appButton({ text: buttonText, botUsername, appUrl, payload })]] } }] : undefined;
  return maxCall(token, "/messages", { method: "POST", query: { [destination.kind]: destination.id }, payload: { text, ...(attachments ? { attachments } : {}) } });
}

const oneLine = (value, limit) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);

export function inviteMessageBody({ ownerName, event, code, botUsername, appUrl }) {
  const bot = oneLine(botUsername, 100).replace(/^@/, "");
  const link = `https://max.ru/${bot}?startapp=i_${code}`;
  let imageUrl;
  try {
    const url = new URL(event?.image, `${appUrl}/`);
    if (event?.image && url.protocol === "https:") imageUrl = url.href;
  } catch { /* An event without a usable photo is sent as text, never with unrelated artwork. */ }
  const name = oneLine(ownerName, 60) || "Друг";
  const title = oneLine(event?.short || event?.title, 180) || "Доброе дело";
  return {
    text: `${name} зовёт тебя сделать доброе дело вместе 🌿\n\n${title}\n\nПосмотри детали и присоединяйся, если тебе подходит:\n${link}`,
    ...(imageUrl ? { attachments: [{ type: "image", payload: { url: imageUrl } }] } : {}),
    notify: false,
  };
}

export async function sendInviteMessage(token, userId, options, call = maxCall) {
  const response = await call(token, "/messages", {
    method: "POST",
    query: { user_id: userId, disable_link_preview: true },
    payload: inviteMessageBody(options),
  });
  const mid = response?.message?.body?.mid;
  if (typeof mid !== "string" || !mid) throw new Error("MAX не вернул идентификатор приглашения.");
  return mid;
}

export async function requestUserLocation(token, userId) {
  return maxCall(token, "/messages", {
    method: "POST",
    query: { user_id: userId },
    payload: {
      text: "Чтобы показать добрые дела рядом, поделись геопозицией. Мы используем её только для карты.",
      attachments: [{ type: "inline_keyboard", payload: { buttons: [[{ type: "request_geo_location", text: "Поделиться геопозицией" }]] } }],
    },
  });
}

export function locationFromMessage(message) {
  const attachment = message?.body?.attachments?.find((item) => item.type === "location");
  const coordinates = attachment?.payload || attachment;
  const lat = Number(coordinates?.latitude ?? coordinates?.lat);
  const lng = Number(coordinates?.longitude ?? coordinates?.lon ?? coordinates?.lng);
  return Number.isFinite(lat) && lat >= -90 && lat <= 90 && Number.isFinite(lng) && lng >= -180 && lng <= 180
    ? { lat, lng }
    : null;
}

function command(text) { return String(text || "").trim().split(/[ @]/)[0].toLowerCase(); }

export async function startPolling({ token, appUrl, botUsername, store, catalog, catalogRepository }) {
  let marker = Number(await store.meta("max_marker") || 0) || null;
  console.log("MAX Long Polling запущен (для разработки; production используйте Webhook).");
  while (true) {
    try {
      const query = { limit: 100, timeout: 30, types: "message_created,message_callback,bot_started,bot_stopped" };
      if (marker != null) query.marker = marker;
      const result = await maxCall(token, "/updates", { query });
      if (result.marker != null) { marker = result.marker; await store.setMeta("max_marker", marker); }
      const currentCatalog = typeof catalog === "function" ? await catalog() : catalog;
      for (const update of result.updates || []) await processUpdate({ token, update, appUrl, botUsername, store, catalog: currentCatalog, catalogRepository });
    } catch (error) {
      console.error(`MAX connection failed: ${error.message}. Повтор через 5 секунд.`);
      await pause(5000);
    }
  }
}

export async function processUpdate({ token, update, appUrl, botUsername, store, catalog, catalogRepository, call = maxCall }) {
  if (update?.update_type === "bot_stopped" && update.user?.user_id != null) {
    const stopped = await store.user(`max:${update.user.user_id}`);
    if (stopped) { stopped.dailyDigest = false; stopped.botConnected = false; stopped.chatId = null; await store.saveUser(stopped); }
    return;
  }
  if (update?.update_type === "bot_started" && update.user) {
    update.message = { sender: update.user, recipient: { user_id: update.user.user_id } };
  }
  const parsed = updateUser(update);
  if (!parsed) return;
  const { sender, destination, message } = parsed;
  const id = `max:${sender.user_id}`;
  let user = await store.user(id) || { id, name: sender.first_name || "Друг", profile: { city: "Москва", category: "all", barrier: "company", interests: [] }, reminders: true };
  user.name = sender.first_name || user.name || "Друг";
  if (destination.kind === "chat_id") user.chatId = destination.id;
  user.botConnected = true;
  user.registered = true;
  if (update?.update_type === "bot_started") user.dailyDigest = true;
  const location = locationFromMessage(message);
  const requestedAt = Date.parse(user.locationRequestAt || "");
  if (location && Number.isFinite(requestedAt) && Date.now() - requestedAt < 10 * 60 * 1000) {
    // Persist independently: concurrent profile saves cannot overwrite a fresh point.
    user.locationRequestAt = null;
    user.locationRequestContext = null;
    await store.saveUser(user);
    if(store.setLocation) await store.setLocation(user.id,location);
    else { user.sharedLocation={...location,at:new Date().toISOString()}; await store.saveUser(user); }
    try {
      await call(token, "/messages", { method: "POST", query: { [destination.kind]: destination.id }, payload: botMessageBody({ text: "Геопозиция сохранена. Вернись на карту в мини-приложении.", buttons: [[miniAppButton("Открыть карту", { appUrl, botUsername, payload: "tab_map" })]] }) });
    } catch (error) { console.error(`Location confirmation failed: ${error.message}`); }
    return;
  }
  // Old callback buttons must never execute chat-only actions or resume dialogs.
  user.botDialog = null;
  const callbackId = update?.update_type === "message_callback" ? update.callback?.callback_id : null;
  const input = callbackId ? "" : message.body?.text || (update?.update_type === "bot_started" ? "/start" : "");
  if (command(input) === "/stop") user.dailyDigest = false;
  if (command(input) === "/start") user.dailyDigest = true;
  await store.saveUser(user);
  if (!input && !callbackId) return;
  const text = command(input) === "/stop"
    ? "Ежедневная подборка отключена. Включить её снова можно в настройках мини-приложения."
    : "Здесь приходят только ежедневные рекомендации. Все дела, карта, планы и настройки — в мини-приложении.";
  const payload = botMessageBody({ text, buttons: [[miniAppButton("Открыть «хелпи»", { appUrl, botUsername })]] });
  if (callbackId) {
    await call(token, "/answers", { method: "POST", query: { callback_id: callbackId }, payload: { message: payload } });
  } else await call(token, "/messages", { method: "POST", query: { [destination.kind]: destination.id }, payload });
}

export async function startDailyDigestLoop({ token, appUrl, botUsername, store, catalogRepository }) {
  // A database claim makes the morning digest safe across restarts and app replicas.
  let digestRunning = false;
  let nextDigestSweep = 0;
  const sendDailyDigests = async () => {
    if (digestRunning || Date.now() < nextDigestSweep || process.env.DEMO_MODE !== "false" || !catalogRepository) return;
    const now = new Date();
    const day = now.toLocaleDateString("sv-SE", { timeZone: "Europe/Moscow" });
    const hour = Number(now.toLocaleString("en-US", { timeZone: "Europe/Moscow", hour: "2-digit", hourCycle: "h23" }));
    if (hour < 9 || hour >= 11) return;
    digestRunning = true;
    nextDigestSweep = Date.now() + 30 * 60_000;
    try {
      const currentCatalog = await catalogRepository.listActive();
      for (const user of await store.users()) {
        if (!user.id?.startsWith("max:") || !(user.chatId || user.botConnected) || user.dailyDigest === false || (user.reminders === false && user.dailyDigest !== true) || !user.interestOnboarded) continue;
        try {
          const result = await botRecommendations({ user, store, catalogRepository, catalog: currentCatalog });
          if (result.recommendations.stage !== "feed") continue;
          const ids = result.recommendations.sections.find(section => section.id === "daily")?.eventIds || [];
          const byId = new Map(result.available.map(event => [event.id, event]));
          const panel = dailyDigestPanel(ids.map(id => byId.get(id)).filter(Boolean), { appUrl, botUsername });
          if (!panel || !await store.claimDailyDigest(user.id, day)) continue;
          try {
            await maxCall(token, "/messages", { method: "POST", query: { user_id: user.id.slice(4), disable_link_preview: true }, payload: botMessageBody(panel, appUrl) });
            await store.finishDailyDigest(user.id, day, true);
          } catch (error) {
            await store.finishDailyDigest(user.id, day, false);
            console.error(`Daily digest delivery failed for ${user.id}: ${error.message}`);
          }
        } catch (error) { console.error(`Daily digest preparation failed for ${user.id}: ${error.message}`); }
      }
    } finally { digestRunning = false; }
  };
  setInterval(() => sendDailyDigests().catch(error => console.error(`Daily digest sweep failed: ${error.message}`)), 60_000).unref();
  sendDailyDigests().catch(error => console.error(`Daily digest sweep failed: ${error.message}`));
}
