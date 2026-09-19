import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createStore } from "./store.js";
import { telegramUser, validatePlan } from "./domain.js";
import { startBot } from "./telegram.js";
import { validateHours } from './garden.js';
import { recommendationView, recordFeedback, resetRecommendation, themeIds } from './recommendation.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const store = createStore(
  process.env.DB_PATH || path.join(root, "var/app.sqlite"),
);
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "data/catalog.json"), "utf8"),
);
const dev = process.argv.includes("--dev");
const demo = process.env.DEMO_MODE !== "false";
const token = process.env.TELEGRAM_BOT_TOKEN;
const appUrl = process.env.MINI_APP_URL || "";
if (token && (!appUrl.startsWith("https://") || demo))
  throw new Error("Telegram requires HTTPS MINI_APP_URL and DEMO_MODE=false.");
const vite = dev
  ? await (
      await import("vite")
    ).createServer({ root, server: { middlewareMode: true }, appType: "spa" })
  : null;
const json = (res, status, data) => {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(data));
};
function fail(message, status = 400) {
  throw Object.assign(new Error(message), { status });
}
async function body(req) {
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (Buffer.byteLength(raw) > 16000) fail("Слишком большой запрос.", 413);
  }
  try {
    return JSON.parse(raw || "{}");
  } catch {
    fail("Некорректный JSON.");
  }
}
function user(req, res) {
  let id, name;
  const init = req.headers["x-telegram-init-data"];
  if (init) {
    try {
      const u = telegramUser(init, token);
      id = `tg:${u.id}`;
      name = u.first_name;
    } catch (e) {
      fail(e.message, 401);
    }
  } else if (demo) {
    let session = req.headers.cookie?.match(
      /(?:^|;\s*)first_session=([a-f0-9]{48})(?:;|$)/,
    )?.[1];
    if (!session || !store.user(`demo:${session}`)) {
      session = randomBytes(24).toString("hex");
      res.setHeader(
        "Set-Cookie",
        `first_session=${session}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${appUrl.startsWith("https:") ? "; Secure" : ""}`,
      );
    }
    id = `demo:${session}`;
    name = "Друг";
  } else fail("Откройте приложение из Telegram.", 401);
  let u = store.user(id);
  if (!u) {
    u = {
      id,
      name,
      profile: { city: "Москва", category: "all", barrier: "company", interests: [] },
      interestOnboarded: false,
      onboarded: false,
      reminders: false,
      createdAt: new Date().toISOString(),
    };
    store.saveUser(u);
  }
  return u;
}
const viewPlan = (p, u) => {
  const { owner, members, ...safe } = p;
  return {
    ...safe,
    owner: owner === u.id ? u.id : null,
    members: members.map(({ name }) => ({ name })),
    event: catalog.find((e) => e.id === p.eventId),
  };
};
function mine(u) {
  return store
    .plans()
    .filter((p) => p.owner === u.id || p.members.some((m) => m.id === u.id))
    .map((p) => viewPlan(p, u));
}
const rates = new Map();
const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    if (!url.pathname.startsWith("/api/")) {
      if (vite) return vite.middlewares(req, res);
      let file = path.join(root, "dist", decodeURIComponent(url.pathname));
      if (
        !file.startsWith(path.join(root, "dist") + path.sep) &&
        file !== path.join(root, "dist")
      )
        fail("Не найдено.", 404);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory())
        file = path.join(root, "dist/index.html");
      if (!fs.existsSync(file)) fail("Сначала выполните npm run build.", 503);
      const types = {
        ".html": "text/html; charset=utf-8",
        ".js": "text/javascript",
        ".css": "text/css",
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
      };
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      return fs.createReadStream(file).pipe(res);
    }
    if (url.pathname === "/api/health")
      return json(res, 200, { ok: true, mode: demo ? "demo" : "telegram" });
    if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method))
      fail("Метод не поддерживается.", 405);
    if (req.method !== "GET") {
      const origin = req.headers.origin;
      if (
        origin &&
        origin !== `http://${req.headers.host}` &&
        origin !== `https://${req.headers.host}` &&
        origin !== appUrl
      )
        fail("Недопустимый источник запроса.", 403);
      if (!req.headers["content-type"]?.startsWith("application/json"))
        fail("Нужен application/json.", 415);
      const key = req.socket.remoteAddress;
      const r = rates.get(key) || { start: Date.now(), count: 0 };
      if (Date.now() - r.start > 60000) {
        r.start = Date.now();
        r.count = 0;
      }
      if (++r.count > 120)
        fail("Слишком много действий. Попробуйте через минуту.", 429);
      rates.set(key, r);
    }
    const u = user(req, res);
    const data = req.method === "GET" ? {} : await body(req);
    if (url.pathname === "/api/bootstrap" && req.method === "GET") {
      const recommendations = recommendationView(u, catalog);
      store.saveUser(u);
      return json(res, 200, {
        user: u,
        plans: mine(u),
        catalog,
        recommendations,
        mode: demo ? "demo" : "telegram",
        botUsername: process.env.BOT_USERNAME || null,
      });
    }
    if (url.pathname === "/api/profile" && req.method === "PATCH") {
      const interests = Array.isArray(data.interests)
        ? [...new Set(data.interests.filter((value) => themeIds.includes(value)))].slice(0, 14)
        : null;
      if (interests && interests.length < 5) fail("Выберите минимум 5 интересов.");
      u.profile = {
        city: "Москва",
        category: ["all", "animals", "people"].includes(data.category)
          ? data.category
          : u.profile.category,
        barrier: ["company", "unknown", "time"].includes(data.barrier)
          ? data.barrier
          : u.profile.barrier,
        interests: interests || (u.profile.interests || []),
      };
      if (interests) {
        resetRecommendation(u, catalog, interests);
      }
      if (typeof data.reminders === "boolean") u.reminders = data.reminders;
      store.saveUser(u);
      return json(res, 200, u);
    }
    if (url.pathname === "/api/recommendations/feedback" && req.method === "POST") {
      recordFeedback(u, catalog, data);
      store.saveUser(u);
      return json(res, 200, { user: u, recommendations: recommendationView(u, catalog) });
    }
    if (url.pathname === "/api/me" && req.method === "DELETE") {
      store.deleteUser(u.id);
      res.setHeader(
        "Set-Cookie",
        "first_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0",
      );
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/api/plans" && req.method === "POST") {
      const event = catalog.find((e) => e.id === data.eventId);
      const fields = validatePlan(data, event);
      const existing = mine(u).find(
        (p) =>
          p.eventId === data.eventId &&
          !["done", "cancelled"].includes(p.status),
      );
      if (existing) return json(res, 200, existing);
      recordFeedback(u, catalog, { eventId: event.id, action: "like", context: "plan" });
      store.saveUser(u);
      const p = {
        id: randomUUID(),
        owner: u.id,
        eventId: event.id,
        ...fields,
        status: "draft",
        checks: [],
        members: [],
        createdAt: new Date().toISOString(),
        reflection: null,
      };
      store.savePlan(p);
      return json(res, 201, viewPlan(p, u));
    }
    const match = url.pathname.match(
      /^\/api\/plans\/([^/]+)(?:\/(invite|leave))?$/,
    );
    if (match) {
      const p = store.plan(match[1]);
      if (!p || (p.owner !== u.id && !p.members.some((m) => m.id === u.id)))
        fail("План не найден.", 404);
      if (match[2] === "leave" && req.method === "POST") {
        if (p.owner === u.id) fail("Владелец может отменить план.");
        p.members = p.members.filter((m) => m.id !== u.id);
        store.savePlan(p);
        return json(res, 200, { ok: true });
      }
      if (p.owner !== u.id) fail("Изменить план может его автор.", 403);
      if (match[2] === "invite" && req.method === "POST") {
        if (["done", "cancelled"].includes(p.status)) fail("Этот план закрыт.");
        store.revoke(p.id);
        const code = randomBytes(18).toString("hex");
        store.saveInvite(code, p.id, Date.now() + 7 * 86400000);
        return json(res, 201, { code });
      }
      if (match[2] === "invite" && req.method === "DELETE") {
        store.revoke(p.id);
        return json(res, 200, { ok: true });
      }
      if (!match[2] && req.method === "PATCH") {
        if (["done", "cancelled"].includes(p.status))
          fail("Этот план уже закрыт.");
        if (data.status === "cancelled") {
          p.status = "cancelled";
          store.revoke(p.id);
        } else if (data.status === "done") {
          if (!p.when || Date.parse(p.when) > Date.now() || !p.confirmed)
            fail("Отметить визит можно после согласованной даты.");
          if (!["warm", "okay", "hard"].includes(data.reflection))
            fail("Выберите, как прошёл визит.");
          p.hours = validateHours(data.hours);
          p.status = "done";
          p.reflection = data.reflection;
          p.completedAt = new Date().toISOString();
          recordFeedback(u, catalog, { eventId: p.eventId, action: "like", context: "visit" });
          store.saveUser(u);
          store.revoke(p.id);
        } else {
          Object.assign(
            p,
            validatePlan(
              { ...p, ...data },
              catalog.find((e) => e.id === p.eventId),
            ),
          );
          if (data.checks)
            p.checks = [...new Set(data.checks)].filter((x) =>
              ["contact", "route", "bag"].includes(x),
            );
          p.status = p.confirmed && p.when ? "ready" : "draft";
          if(p.status === 'ready' && !p.agreedAt) p.agreedAt = new Date().toISOString();
          if (data.when !== undefined) p.reminded = false;
        }
        store.savePlan(p);
        return json(res, 200, viewPlan(p, u));
      }
    }
    const invite = url.pathname.match(/^\/api\/invites\/([a-f0-9]{36})$/);
    if (invite) {
      const i = store.invite(invite[1]);
      const p = i && store.plan(i.plan);
      if (
        !p ||
        i.expires < Date.now() ||
        ["done", "cancelled"].includes(p.status)
      )
        fail(
          "Приглашение истекло или отозвано. Попросите друга прислать новое.",
          410,
        );
      if (req.method === "GET")
        return json(res, 200, {
          event: catalog.find((e) => e.id === p.eventId),
          when: p.when,
          confirmed: p.confirmed,
          ownerName: store.user(p.owner)?.name || "Друг",
          joined: p.owner === u.id || p.members.some((m) => m.id === u.id),
        });
      if (req.method === "POST") {
        if (p.owner !== u.id && !p.members.some((m) => m.id === u.id)) {
          if (p.members.length >= 3)
            fail("Компания уже собралась: не больше четырёх человек.");
          p.members.push({ id: u.id, name: u.name });
          store.savePlan(p);
        }
        return json(res, 200, viewPlan(p, u));
      }
    }
    fail("Не найдено.", 404);
  } catch (e) {
    json(res, e.status || 400, {
      error:
        e.status === 500 ? "Ошибка сервера. Попробуйте ещё раз." : e.message,
    });
  }
});
server.listen(
  Number(process.env.PORT || 3210),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `Первый шаг: http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3210} (${demo ? "demo" : "telegram"})`,
    ),
);
if (token) startBot({ token, appUrl, store, catalog });
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(() => process.exit(0)));
