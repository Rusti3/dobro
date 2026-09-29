import { recommendationsForUser } from "./recommendation-context.js";

const short = (value, limit) => String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);

export function miniAppButton(text, { botUsername, appUrl, payload = "" }) {
  if (botUsername) return { type: "open_app", text, web_app: botUsername.replace(/^@/, ""), ...(payload ? { payload } : {}) };
  const url = new URL(appUrl);
  if (payload) url.searchParams.set("startapp", payload);
  return { type: "link", text, url: url.href };
}

export function botMessageBody(panel) {
  return { text: panel.text, ...(panel.buttons?.length ? { attachments: [{ type: "inline_keyboard", payload: { buttons: panel.buttons } }] } : {}), notify: false };
}

export function dailyDigestPanel(events, options) {
  const selected = events.slice(0, 4);
  if (!selected.length) return null;
  return {
    text: `Добрые дела на сегодня 🌿\n\n${selected.map((event, index) => `${index + 1}. ${short(event.short || event.title, 90)}${event.distanceKm != null ? ` · ${Number(event.distanceKm).toFixed(1).replace(".", ",")} км по прямой` : ""}`).join("\n")}\n\nПодробности и запись — в мини-приложении.`,
    buttons: selected.map((event, index) => [miniAppButton(`${index + 1}. ${short(event.short || event.title, 28)}`, { ...options, payload: `e_${event.id}` })]),
  };
}

export async function botRecommendations({ user, store, catalogRepository, catalog }) {
  return recommendationsForUser({ user, store, catalogRepository: catalogRepository || { historicalEvents: async () => [] }, rawCatalog: catalog, city: user.profile?.city });
}
