import fs from "node:fs";
import path from "node:path";
import {
  randomBytes,
  randomUUID,
} from "node:crypto";
import { botReply, telegramUser } from "../server/domain.js";
import { validateHours } from '../server/garden.js';
import { webhookSecret } from '../server/telegram-config.js';
import { recommendationView, recordFeedback, resetRecommendation, themeIds } from '../server/recommendation.js';

const catalog = JSON.parse(
  fs.readFileSync(path.join(process.cwd(), "data/catalog.json"), "utf8"),
);
const memory =
  globalThis.__firstStepVercel ||
  (globalThis.__firstStepVercel = {
    users: new Map(),
    plans: new Map(),
    invites: new Map(),
    offset: 0,
  });
const json = (res, status, data) => {
  res.status(status).setHeader("Cache-Control", "no-store").json(data);
};
const fail = (message, status = 400) => {
  const e = new Error(message);
  e.status = status;
  throw e;
};
const readBody = async (req) => {
  // Vercel can parse JSON before invoking the handler.
  if (req.body !== undefined) {
    if (typeof req.body === 'object' && req.body !== null && !Buffer.isBuffer(req.body)) return req.body;
    try { return JSON.parse(String(req.body)); } catch { fail('Некорректный JSON.'); }
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 16000) fail("Слишком большой запрос.", 413);
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    fail("Некорректный JSON.");
  }
};
function parseCookie(req, name) {
  return (
    req.headers.cookie?.match(
      new RegExp(`(?:^|;\\s*)${name}=([a-f0-9]{48})(?:;|$)`),
    )?.[1] || null
  );
}
function verifyInit(raw, token) {
  if (!token?.trim()) fail('На сервере не настроен TELEGRAM_BOT_TOKEN. Добавьте его в Vercel и выполните Redeploy.', 503);
  let u;
  try { u = telegramUser(raw, token.trim()); } catch(e) { fail(e.message,401); }
  return { id: `tg:${u.id}`, name: u.first_name || "Друг", chatId: u.id };
}
function user(req, res) {
  const init = req.headers["x-telegram-init-data"];
  let u;
  if (init) u = verifyInit(init, process.env.TELEGRAM_BOT_TOKEN);
  else if (process.env.DEMO_MODE === "true") {
    let s = parseCookie(req, "first_session");
    if (!s) {
      s = randomBytes(24).toString("hex");
      res.setHeader(
        "Set-Cookie",
        `first_session=${s}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`,
      );
    }
    const id = `demo:${s}`;
    u = memory.users.get(id) || {
      id,
      name: "Друг",
      profile: { city: "Москва", category: "all", barrier: "company", interests: [] },
      reminders: false,
      interestOnboarded: false,
      onboarded: false,
    };
  } else fail("Откройте приложение из Telegram.", 401);
  const existing = memory.users.get(u.id);
  const complete = {
    profile: {city:'Москва',category:'all',barrier:'company',interests:[]},
    reminders:false,
    createdAt:new Date().toISOString(),
    ...existing,
    ...u,
  };
  memory.users.set(u.id, complete);
  return complete;
}
function event(id) {
  return catalog.find((e) => e.id === id);
}
function validate(fields, e) {
  if (!e || Date.parse(e.endsAt) < Date.now())
    fail("Событие завершилось. Выберите другое дело.");
  const when = fields.when || null;
  if (
    when &&
    (!Number.isFinite(Date.parse(when)) ||
      Date.parse(when) <= Date.now() ||
      Date.parse(when) < Date.parse(e.startsAt) ||
      Date.parse(when) > Date.parse(e.endsAt))
  )
    fail("Выберите будущую дату в периоде события.");
  return {
    when,
    meeting: String(fields.meeting || "")
      .trim()
      .slice(0, 240),
    mode: ["friend", "solo"].includes(fields.mode) ? fields.mode : "friend",
    confirmed: !!fields.confirmed,
  };
}
function safePlan(p, u) {
  const e = event(p.eventId);
  return {
    ...p,
    owner: p.owner === u.id ? p.owner : null,
    members: p.members.map(({ name }) => ({ name })),
    event: e,
  };
}
function plansFor(u) {
  return [...memory.plans.values()]
    .filter((p) => p.owner === u.id || p.members.some((m) => m.id === u.id))
    .map((p) => safePlan(p, u));
}
async function telegram(method, data) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) fail('На сервере не настроен TELEGRAM_BOT_TOKEN.',503);
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if(!result.ok) fail(`Telegram не принял ответ бота (код ${result.error_code}). Проверьте токен и MINI_APP_URL.`,502);
}
async function webhook(req, res) {
  if (req.method !== "POST")
    return json(res, 405, { error: "Метод не поддерживается." });
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if(!token) fail('На сервере не настроен TELEGRAM_BOT_TOKEN.',503);
  const secret = webhookSecret(token, process.env.TELEGRAM_WEBHOOK_SECRET);
  if (req.headers["x-telegram-bot-api-secret-token"] !== secret)
    return json(res, 403, { error: "Forbidden" });
  const update = await readBody(req);
  const m = update.message;
  if (m?.chat?.type === "private" && m.from && !m.from.is_bot) {
    const id = `tg:${m.from.id}`;
    const u = memory.users.get(id) || {
      id,
      name: m.from.first_name || "Друг",
      profile: { city: "Москва", category: "all", barrier: "company", interests: [] },
      reminders: false,
      chatId: m.chat.id,
    };
    u.chatId = m.chat.id;
    memory.users.set(id, u);
    const text = m.text || "";
    const cmd = text.split(/[ @]/)[0];
    let reply = botReply(text, u.name),
      url = process.env.MINI_APP_URL?.trim().replace(/\/+$/, '') || "";
    if(!url.startsWith('https://')) fail('Настройте HTTPS MINI_APP_URL в Vercel.',503);
    if (cmd === "/plan") {
      const p = plansFor(u).find(
        (p) => !["cancelled", "done"].includes(p.status),
      );
      reply = p
        ? `Твой план: ${p.event.short}. ${p.when ? "Дата: " + new Date(p.when).toLocaleString("ru-RU", { timeZone: "Europe/Moscow" }) : "Дата пока не согласована"}.`
        : "Пока нет активного плана.";
      url += "/?tab=plan";
    }
    if (cmd === "/stop") {
      u.reminders = false;
      memory.users.set(id, u);
    }
    if (cmd === "/garden") {
      reply = "Твой сад хранит истории добрых дел. Открой его, чтобы увидеть растения и выбрать следующий шаг.";
      url += "/?tab=garden";
    }
    if (cmd === "/delete") {
      memory.users.delete(id);
      for (const [pid, p] of memory.plans) {
        if (p.owner === id) memory.plans.delete(pid);
        else p.members = p.members.filter((v) => v.id !== id);
      }
    }
    const invite = text.match(/^\/start(?:@\w+)? i_([a-f0-9]{36})$/)?.[1];
    if (invite) url += `/?invite=${invite}`;
    await telegram("sendMessage", {
      chat_id: m.chat.id,
      text: reply,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: invite ? "Открыть приглашение" : "Открыть «Первый шаг»",
              web_app: { url },
            },
          ],
        ],
      },
    });
  }
  return json(res, 200, { ok: true });
}
export default async function handler(req, res) {
  try {
    const pathname = new URL(req.url, `https://${req.headers.host || "vercel"}`)
      .pathname;
    if (pathname === "/api/telegram") return await webhook(req, res);
    if (pathname === "/api/health")
      return json(res, 200, {
        ok: true,
        mode: process.env.DEMO_MODE === "true" ? "demo" : "telegram",
      });
    const u = user(req, res);
    const method = req.method;
    const body = method === "GET" ? {} : await readBody(req);
    if (pathname === "/api/bootstrap" && method === "GET") {
      const recommendations = recommendationView(u, catalog);
      memory.users.set(u.id, u);
      return json(res, 200, {
        user: u,
        plans: plansFor(u),
        catalog,
        recommendations,
        mode: process.env.DEMO_MODE === "true" ? "demo" : "telegram",
        botUsername: process.env.BOT_USERNAME || null,
      });
    }
    if (pathname === "/api/profile" && method === "PATCH") {
      const interests = Array.isArray(body.interests)
        ? [...new Set(body.interests.filter((value) => themeIds.includes(value)))].slice(0, 14)
        : null;
      if (interests && interests.length < 5) fail("Выберите минимум 5 интересов.");
      u.profile = {
        city: "Москва",
        category: ["all", "animals", "people"].includes(body.category)
          ? body.category
          : u.profile.category,
        barrier: ["company", "unknown", "time"].includes(body.barrier)
          ? body.barrier
          : u.profile.barrier,
        interests: interests || (u.profile.interests || []),
      };
      if (interests) {
        resetRecommendation(u, catalog, interests);
      }
      if (typeof body.reminders === "boolean") u.reminders = body.reminders;
      memory.users.set(u.id, u);
      return json(res, 200, u);
    }
    if (pathname === "/api/recommendations/feedback" && method === "POST") {
      recordFeedback(u, catalog, body);
      memory.users.set(u.id, u);
      return json(res, 200, { user: u, recommendations: recommendationView(u, catalog) });
    }
    if (pathname === "/api/me" && method === "DELETE") {
      memory.users.delete(u.id);
      for (const [id, p] of memory.plans) {
        if (p.owner === u.id) memory.plans.delete(id);
        else p.members = p.members.filter((m) => m.id !== u.id);
      }
      return json(res, 200, { ok: true });
    }
    if (pathname === "/api/plans" && method === "POST") {
      const e = event(body.eventId);
      const fields = validate(body, e);
      const old = plansFor(u).find(
        (p) =>
          p.eventId === body.eventId &&
          !["done", "cancelled"].includes(p.status),
      );
      if (old) return json(res, 200, old);
      recordFeedback(u, catalog, { eventId: e.id, action: "like", context: "plan" });
      memory.users.set(u.id, u);
      const p = {
        id: randomUUID(),
        owner: u.id,
        eventId: e.id,
        ...fields,
        status: "draft",
        checks: [],
        members: [],
        createdAt: new Date().toISOString(),
        reflection: null,
      };
      memory.plans.set(p.id, p);
      return json(res, 201, safePlan(p, u));
    }
    const pm = pathname.match(/^\/api\/plans\/([^/]+)(?:\/(invite|leave))?$/);
    if (pm) {
      const p = memory.plans.get(pm[1]);
      if (!p || !(p.owner === u.id || p.members.some((m) => m.id === u.id)))
        fail("План не найден.", 404);
      if (pm[2] === "leave" && method === "POST") {
        if (p.owner === u.id) fail("Владелец может отменить план.");
        p.members = p.members.filter((m) => m.id !== u.id);
        return json(res, 200, { ok: true });
      }
      if (p.owner !== u.id) fail("Изменить план может его автор.", 403);
      if (pm[2] === "invite" && method === "POST") {
        const code = randomBytes(18).toString("hex");
        memory.invites.set(code, {
          plan: p.id,
          expires: Date.now() + 7 * 86400000,
        });
        return json(res, 201, { code });
      }
      if (pm[2] === "invite" && method === "DELETE") {
        for (const [code, i] of memory.invites)
          if (i.plan === p.id) memory.invites.delete(code);
        return json(res, 200, { ok: true });
      }
      if (!pm[2] && method === "PATCH") {
        if (["done", "cancelled"].includes(p.status))
          fail("Этот план уже закрыт.");
        if (body.status === "cancelled") {
          p.status = "cancelled";
        } else if (body.status === "done") {
          if (!p.when || Date.parse(p.when) > Date.now() || !p.confirmed)
            fail("Отметить визит можно после согласованной даты.");
          if (!["warm", "okay", "hard"].includes(body.reflection))
            fail("Выберите, как прошёл визит.");
          p.hours = validateHours(body.hours);
          p.status = "done";
          p.reflection = body.reflection;
          p.completedAt = new Date().toISOString();
          recordFeedback(u, catalog, { eventId: p.eventId, action: "like", context: "visit" });
          memory.users.set(u.id, u);
        } else {
          Object.assign(p, validate({ ...p, ...body }, event(p.eventId)));
          if (body.checks)
            p.checks = [...new Set(body.checks)].filter((x) =>
              ["contact", "route", "bag"].includes(x),
            );
          p.status = p.confirmed && p.when ? "ready" : "draft";
          if(p.status === 'ready' && !p.agreedAt) p.agreedAt = new Date().toISOString();
        }
        return json(res, 200, safePlan(p, u));
      }
    }
    const im = pathname.match(/^\/api\/invites\/([a-f0-9]{36})$/);
    if (im) {
      const i = memory.invites.get(im[1]),
        p = i && memory.plans.get(i.plan);
      if (
        !p ||
        i.expires < Date.now() ||
        ["done", "cancelled"].includes(p.status)
      )
        fail("Приглашение истекло или отозвано.", 410);
      if (method === "GET")
        return json(res, 200, {
          event: event(p.eventId),
          when: p.when,
          confirmed: p.confirmed,
          ownerName: memory.users.get(p.owner)?.name || "Друг",
          joined: p.owner === u.id || p.members.some((m) => m.id === u.id),
        });
      if (method === "POST") {
        if (p.owner !== u.id && !p.members.some((m) => m.id === u.id)) {
          if (p.members.length >= 3) fail("Компания уже собралась.");
          p.members.push({ id: u.id, name: u.name });
        }
        return json(res, 200, safePlan(p, u));
      }
    }
    fail("Не найдено.", 404);
  } catch (e) {
    return json(res, e.status || 400, {
      error: e.message || "Ошибка сервера.",
    });
  }
}
