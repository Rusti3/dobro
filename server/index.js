import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import swaggerUiDist from "swagger-ui-dist";
import { createStore } from "./store.js";
import { createPool, databaseHealth, runMigrations } from "./database.js";
import { createCatalogRepository } from "./catalog-repository.js";
import { eligibleEvents, eventAllowedForUser, maxProfile, maxUser, validatePlan, validateRegistration, validateAge } from "./domain.js";
import { startPolling, startDailyDigestLoop, processUpdate, requestUserLocation, sendInviteMessage } from "./max.js";
import { validateHours } from './garden.js';
import { themeIds } from '../shared/theme-ids.js';
import { publicEvent } from './public-event.js';
import { activeLocation, validPoint } from './location.js';
import { loadRecommendationContext } from './recommendation-context.js';
import { recsys, recsysHealth } from './recsys-client.js';
import { migratePrivateData, requirePrivateDataKey } from './private-data.js';
import { demoDataEnabled, seedDemoCatalog, seedDemoPlan } from './demo-data.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const swaggerAssets = swaggerUiDist.getAbsoluteFSPath();
const pool = createPool({ applicationName: "dobrie_dela_web" });
await runMigrations(pool);
if (process.env.REQUIRE_PRIVATE_DATA_ENCRYPTION === "true" || (process.env.NODE_ENV === "production" && process.env.DEMO_MODE === "false")) requirePrivateDataKey();
await migratePrivateData(pool);
const store = createStore(pool);
const catalogRepository = createCatalogRepository(pool);
if (demoDataEnabled()) await seedDemoCatalog(pool);
else await catalogRepository.seedFromBundledCatalog();
const dev = process.argv.includes("--dev");
const demo = process.env.DEMO_MODE !== "false";
const token = demo ? undefined : process.env.MAX_BOT_TOKEN;
const appUrl = (process.env.MAX_MINI_APP_URL || "").trim().replace(/\/+$/, "");
const botUsername = process.env.MAX_BOT_USERNAME || "";
const webhookUrl = process.env.MAX_WEBHOOK_URL || "";
const localAddresses = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const localPreview = process.env.NODE_ENV !== "production";
const demoCookiePath = /^\/[a-zA-Z0-9/_-]*$/.test(process.env.DEMO_COOKIE_PATH || '/') ? process.env.DEMO_COOKIE_PATH || '/' : '/';
const apiPrefix = demoCookiePath === '/' ? '' : demoCookiePath;
const demoProfileTtlDays = Number.parseInt(process.env.DEMO_PROFILE_TTL_DAYS || '0', 10);
if (process.env.DEMO_PROFILE_TTL_DAYS && (!demo || !Number.isInteger(demoProfileTtlDays) || demoProfileTtlDays < 1 || demoProfileTtlDays > 30))
  throw new Error('DEMO_PROFILE_TTL_DAYS requires demo mode and a value from 1 to 30.');
if (demoProfileTtlDays) {
  await store.expireDemoProfiles(demoProfileTtlDays);
  setInterval(() => store.expireDemoProfiles(demoProfileTtlDays).catch(error => console.error('Demo profile cleanup:', error)), 6 * 3600_000).unref();
}
if (!demo && !token) throw new Error("MAX_BOT_TOKEN обязателен при DEMO_MODE=false.");
if (token && !demo && (!appUrl.startsWith("https://") || !botUsername))
  throw new Error("MAX production requires HTTPS MAX_MINI_APP_URL and MAX_BOT_USERNAME.");
if (webhookUrl && !process.env.MAX_WEBHOOK_SECRET)
  throw new Error("MAX_WEBHOOK_SECRET обязателен при использовании Webhook.");
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
function isLocalPreview(req) {
  const localHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(
    req.headers.host || "",
  );
  return localPreview && localHost && localAddresses.has(req.socket.remoteAddress || "");
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
async function user(req, res) {
  let id, name;
  const init = req.headers["x-max-init-data"];
  if (init) {
    try {
      const u = maxUser(init, token);
      id = `max:${u.id}`;
      req.maxProfile = maxProfile(u);
      name = req.maxProfile.firstName || "Друг";
    } catch (e) {
      fail(e.message, 401);
    }
  } else if (demo || isLocalPreview(req)) {
    let session = req.headers.cookie?.match(
      /(?:^|;\s*)first_session=([a-f0-9]{48})(?:;|$)/,
    )?.[1];
    if (!session || !(await store.user(`demo:${session}`))) {
      session = randomBytes(24).toString("hex");
      res.setHeader(
        "Set-Cookie",
        `first_session=${session}; HttpOnly; SameSite=Lax; Path=${demoCookiePath}; Max-Age=2592000${
          req.socket.encrypted || req.headers["x-forwarded-proto"] === "https" ? "; Secure" : ""
        }`,
      );
    }
    id = `demo:${session}`;
    name = "Друг";
  } else fail("Откройте приложение из MAX.", 401);
  let u = await store.user(id);
  if (!u) {
    u = {
      id,
      name,
      profile: { city: "Москва", category: "all", barrier: "company", interests: [], age: null },
      registered: true,
      interestOnboarded: false,
      onboarded: false,
      reminders: true,
      gardenIntroSeen: false,
      locationPromptSeen: false,
      createdAt: new Date().toISOString(),
    };
    await store.saveUser(u);
  }
  // Identity is established by verified MAX initData (or the isolated demo cookie),
  // not by asking the user to type their name and age.
  if (!u.registered) {
    u.registered = true;
    if (req.maxProfile) u.name = name;
    await store.saveUser(u);
  }
  await seedDemoPlan(store, catalogRepository, u);
  return u;
}
const viewPlan = (p, u, catalog) => {
  const { owner, members, ...safe } = p;
  return {
    ...safe,
    owner: owner === u.id ? u.id : null,
    members: members.map(({ name }) => ({ name })),
    event: p.eventSnapshot || (catalog.find((e) => e.id === p.eventId) ? publicEvent(catalog.find((e) => e.id === p.eventId)) : undefined),
  };
};
async function mine(u, catalog) {
  return (await store
    .plans())
    .filter((p) => p.owner === u.id || p.members.some((m) => m.id === u.id))
    .map((p) => viewPlan(p, u, catalog));
}
const rates = new Map();
const demoRates = new Map();
const server = http.createServer(async (req, res) => {
  try {
    if (demoProfileTtlDays) {
      const key = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
      const now = Date.now();
      const bucket = demoRates.get(key) || { start: now, count: 0 };
      if (now - bucket.start > 60000) { bucket.start = now; bucket.count = 0; }
      if (++bucket.count > 180) return json(res, 429, { error: 'Слишком много запросов. Попробуйте через минуту.' });
      demoRates.set(key, bucket);
      if (demoRates.size > 20000) for (const [address, value] of demoRates) if (now - value.start > 60000) demoRates.delete(address);
    }
    const url = new URL(req.url, "http://localhost");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    // MAX web embeds mini-apps; CSP below restricts permitted parent origins.
    res.setHeader("Permissions-Policy", "geolocation=(self), camera=(), microphone=()");
    if (process.env.NODE_ENV === "production") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' https://st.max.ru; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https: wss:; worker-src 'self' blob:; font-src 'self' data: https:; object-src 'none'; base-uri 'self'; frame-ancestors 'self' https://web.max.ru; form-action 'self'");
    }
    if (url.pathname !== "/api" && !url.pathname.startsWith("/api/")) {
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
        ".mjs": "text/javascript",
        ".json": "application/json",
        ".css": "text/css",
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
        ".svg": "image/svg+xml",
        ".woff2": "font/woff2",
      };
      res.setHeader(
        "Content-Type",
        types[path.extname(file)] || "application/octet-stream",
      );
      return fs.createReadStream(file).pipe(res);
    }
    if (url.pathname === "/api" || url.pathname === "/api/") {
      if (req.method !== "GET") return json(res, 405, { error: "Метод не поддерживается." });
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      return res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>хелпи API</title><link rel="stylesheet" href="${apiPrefix}/api/swagger-ui/swagger-ui.css"><style>body{margin:0;background:#fafafa;color:#17212b;font-family:system-ui,sans-serif}.api-note{padding:14px 24px;background:#e9f5ed;border-bottom:1px solid #b6d5bd}.api-note a{color:#146c38}.api-note p{margin:6px 0 0}</style></head><body><div class="api-note"><strong>хелпи API</strong> · <a href="${apiPrefix}/api/health">Проверить работу</a> · <a href="${apiPrefix}/api/openapi.yaml">OpenAPI YAML</a><p>${apiPrefix ? 'Это изолированное демо: личные запросы работают через тестовую cookie без логина.' : 'Документация открыта вне MAX. Личные методы требуют подписанные данные запуска MAX; без них запросы вернут 401.'}</p></div><div id="swagger-ui"></div><script src="${apiPrefix}/api/swagger-ui/swagger-ui-bundle.js"></script><script src="${apiPrefix}/api/swagger-ui/init.js"></script></body></html>`);
    }
    if (url.pathname === "/api/index.json") {
      if (req.method !== "GET") return json(res, 405, { error: "Метод не поддерживается." });
      return json(res, 200, {
        name: "хелпи API",
        version: process.env.APP_COMMIT || "local",
        openapi: `${apiPrefix}/api/openapi.yaml`,
        health: `${apiPrefix}/api/health`,
        authentication: apiPrefix ? "Изолированное демо использует HttpOnly cookie без логина и MAX-токена." : "Личные методы требуют подписанные данные запуска MAX в заголовке X-Max-Init-Data.",
      });
    }
    if (url.pathname.startsWith("/api/swagger-ui/")) {
      if (req.method !== "GET") return json(res, 405, { error: "Метод не поддерживается." });
      const asset = url.pathname.slice("/api/swagger-ui/".length);
      if (asset === "init.js") {
        res.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" });
        return res.end(`window.onload=function(){SwaggerUIBundle({url:'${apiPrefix}/api/openapi.yaml',dom_id:'#swagger-ui',deepLinking:true,validatorUrl:null,presets:[SwaggerUIBundle.presets.apis]});};`);
      }
      if (!["swagger-ui-bundle.js", "swagger-ui.css"].includes(asset)) return json(res, 404, { error: "Не найдено." });
      res.writeHead(200, { "Content-Type": asset.endsWith(".css") ? "text/css; charset=utf-8" : "text/javascript; charset=utf-8", "Cache-Control": "public, max-age=3600" });
      return fs.createReadStream(path.join(swaggerAssets, asset)).pipe(res);
    }
    if (url.pathname === "/api/openapi.yaml") {
      if (req.method !== "GET") return json(res, 405, { error: "Метод не поддерживается." });
      res.writeHead(200, { "Content-Type": "application/yaml; charset=utf-8", "Cache-Control": "public, max-age=3600" });
      const specification = fs.readFileSync(path.join(root, "docs", "openapi.yaml"), 'utf8');
      return res.end(apiPrefix ? specification.replace('servers:\n  - url: /\n  - url: /api-test', 'servers:\n  - url: /api-test\n  - url: /') : specification);
    }
    if (url.pathname === "/api/health") {
      const [database, catalog, workerHeartbeat, lastCatalogSync, lastAnnotationBatch, recommendationService] = await Promise.all([
        databaseHealth(pool),
        catalogRepository.counts(),
        store.meta("worker_heartbeat"),
        store.meta("last_catalog_sync"),
        store.meta("last_annotation_batch"),
        recsysHealth(),
      ]);
      return json(res, recommendationService.ok ? 200 : 503, {
        ok: recommendationService.ok,
        version: process.env.APP_COMMIT || 'local',
        mode: demo || isLocalPreview(req) ? "demo" : "max",
        transport: webhookUrl ? "webhook" : "polling",
        database,
        catalog,
        worker: { heartbeat: workerHeartbeat, lastCatalogSync: lastCatalogSync ? JSON.parse(lastCatalogSync) : null, lastAnnotationBatch: lastAnnotationBatch ? JSON.parse(lastAnnotationBatch) : null },
        recsys: recommendationService,
      });
    }
    if (url.pathname === "/api/max/webhook") {
      if (req.method !== "POST") return json(res, 405, { error: "Метод не поддерживается." });
      const expected = process.env.MAX_WEBHOOK_SECRET || "";
      if (!expected || req.headers["x-max-bot-api-secret"] !== expected)
        return json(res, 403, { error: "Forbidden" });
      const update = await body(req);
      await processUpdate({ token, update, appUrl, botUsername, store, catalog: await catalogRepository.listActive(), catalogRepository });
      return json(res, 200, { ok: true });
    }
    if (!["GET", "POST", "PATCH", "DELETE"].includes(req.method))
      fail("Метод не поддерживается.", 405);
    if (req.method !== "GET") {
      const origin = req.headers.origin;
      if (
        origin &&
        origin !== `http://${req.headers.host}` &&
        origin !== `https://${req.headers.host}` &&
        origin !== appUrl &&
        origin !== "https://max.ru" &&
        origin !== "https://web.max.ru"
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
    const u = await user(req, res);
    const data = req.method === "GET" ? {} : await body(req);
    const cityOptions = ['Москва','Санкт-Петербург','Казань','Рыбинск'];
    const requestedCity = url.searchParams.get('city') || data.city;
    const city = cityOptions.includes(requestedCity) ? requestedCity : u.profile?.city || 'Москва';
    const rawCatalog = await catalogRepository.listActive();
    const { location, context, calibrationPreview, projected: catalog, available: availableCatalog } = await loadRecommendationContext({ user: u, store, catalogRepository, rawCatalog, city });
    async function feedback(payload, events=catalog) {
      const result = await recsys('feedback', { user: u, catalog: events, feedback: payload });
      if (!result.interaction) return;
      const inserted = await store.saveInteraction(u.id, result.interaction);
      if (inserted) Object.assign(u, result.user);
    }
    async function selectedEvent(eventId,vacancyId) {
      if(!vacancyId) return catalog.find(event=>event.id===eventId);
      const source=rawCatalog.find(event=>event.id===eventId);
      const variant=source?.variants?.find(event=>event.selectedVacancyId===String(vacancyId));
      return variant ? (await recsys('project', { user: u, catalog: [variant], context })).candidates[0] : null;
    }
    const eventRoute = url.pathname.match(/^\/api\/events\/([a-zA-Z0-9_-]+)$/);
    if (eventRoute && req.method === "GET") {
      const source = rawCatalog.find(event => event.id === eventRoute[1]);
      const candidates = source ? (await recsys('project', { user: u, catalog: [source], context: { ...context, city: source.city || city } })).candidates : [];
      const event = eligibleEvents(candidates, u)[0];
      if (!event) fail("Дело больше недоступно или не подходит по возрасту.", 404);
      return json(res, 200, publicEvent(event));
    }
    if (url.pathname === "/api/bootstrap" && req.method === "GET") {
      const view = await recsys('view', { user: u, catalog: availableCatalog, context });
      Object.assign(u, view.user);
      await store.saveUser(u);
      return json(res, 200, {
        user: { ...u, recommendation: u.recommendation ? { ...u.recommendation, interactions: [] } : undefined },
        maxProfile: req.maxProfile || null,
        plans: await mine(u, catalog),
        catalog: availableCatalog.map(publicEvent),
        location: activeLocation(location),
        recommendations: view.recommendations,
         mode: demo || isLocalPreview(req) ? "demo" : "max",
         botUsername: botUsername || null,
      });
    }
    if (url.pathname === "/api/location/request" && req.method === "POST") {
      if (!u.id.startsWith("max:") || !token || !botUsername)
        fail("Запрос через бота доступен только внутри MAX.", 403);
      const lastRequest = Date.parse(u.locationRequestAt || "");
      if (Number.isFinite(lastRequest) && Date.now() - lastRequest < 30000)
        return json(res, 200, { pending: true, botUsername });
      u.locationRequestAt = new Date().toISOString();
      await store.saveUser(u);
      try {
        await requestUserLocation(token, u.id.slice(4));
      } catch (error) {
        u.locationRequestAt = null;
        await store.saveUser(u);
        console.error(`Location request failed: ${error.message}`);
        fail("Не удалось отправить запрос геопозиции в чат MAX. Попробуй позже.", 502);
      }
      return json(res, 200, { pending: true, botUsername });
    }
    if (url.pathname === "/api/location" && req.method === "GET") {
      const requestedAt = Date.parse(u.locationRequestAt || "");
      return json(res, 200, { location: activeLocation(location), pending: Number.isFinite(requestedAt) && Date.now() - requestedAt < 10 * 60 * 1000 });
    }
    if (url.pathname === '/api/location' && req.method === 'POST') {
      if(!validPoint(data)) fail('Некорректные координаты.');
      return json(res,200,{location:await store.setLocation(u.id,{lat:data.lat,lng:data.lng})});
    }
    if (url.pathname === '/api/location' && req.method === 'DELETE') {
      await store.setLocation(u.id,null);
      u.locationRequestAt=null;
      await store.saveUser(u);
      return json(res,200,{location:null,pending:false});
    }
    if (url.pathname === "/api/profile" && req.method === "PATCH") {
      if (data.registration) {
        const registration = validateRegistration(data.registration);
        u.name = registration.name;
        u.profile = { ...u.profile, age: registration.age };
        u.registered = true;
      }
      if (Object.hasOwn(data, 'age')) u.profile = { ...u.profile, age: validateAge(data.age) };
      if (Object.hasOwn(data, 'volunteerExperience')) {
        if (!['first_time', 'experienced'].includes(data.volunteerExperience)) fail('Выбери ответ об опыте участия.');
        u.profile = { ...u.profile, volunteerExperience: data.volunteerExperience };
      }
      const interests = Array.isArray(data.interests)
        ? [...new Set(data.interests.filter((value) => themeIds.includes(value)))].slice(0, 14)
        : null;
      const allowedCities = ["Москва", "Санкт-Петербург", "Казань", "Рыбинск"];
      u.profile = {
        city: allowedCities.includes(data.city) ? data.city : (allowedCities.includes(u.profile.city) ? u.profile.city : "Москва"),
        category: ["all", "animals", "people"].includes(data.category)
          ? data.category
          : u.profile.category,
        barrier: ["company", "unknown", "time"].includes(data.barrier)
          ? data.barrier
          : u.profile.barrier,
        interests: interests || (u.profile.interests || []),
        age: u.profile.age ?? null,
        volunteerExperience: u.profile.volunteerExperience ?? null,
      };
      const needsCalibrationRefresh = Object.hasOwn(data, 'volunteerExperience') && u.interestOnboarded
        && !(u.recommendation?.interactions || []).some(item => item.context === 'calibration') && !u.onboarded;
      if (interests || needsCalibrationRefresh) {
        if (!u.registered) fail("Сначала закончи регистрацию.", 403);
        const age = Number(u.profile?.age);
        const preview = !(Number.isInteger(age) && age >= 7 && age <= 100);
        const candidates = (await recsys('project', { user: u, catalog: rawCatalog, context: { ...context, city: u.profile.city, ignoreAge: preview } })).candidates;
        const reset = await recsys('reset', { user: u, catalog: preview ? candidates : eligibleEvents(candidates,u), interests: interests || u.profile.interests || [] });
        Object.assign(u, reset.user);
      }
      if (typeof data.reminders === "boolean") u.reminders = data.reminders;
      if (typeof data.dailyDigest === "boolean") u.dailyDigest = data.dailyDigest;
      await store.saveUser(u);
      return json(res, 200, u);
    }
    if (url.pathname === "/api/garden/intro-seen" && req.method === "POST") {
      await store.markGardenIntroSeen(u.id);
      return json(res, 200, { seen: true });
    }
    if (url.pathname === "/api/onboarding/location-intro-seen" && req.method === "POST") {
      await store.markLocationPromptSeen(u.id);
      return json(res, 200, { seen: true });
    }
    if (url.pathname === "/api/recommendations/feedback" && req.method === "POST") {
      if (!u.registered) fail("Сначала закончи регистрацию.", 403);
      if(!['calibration','daily'].includes(data.context) || !['like','skip'].includes(data.action)) fail('Некорректная реакция.');
      await feedback(data,availableCatalog);
      await store.saveUser(u);
      const feedCatalog = u.onboarded ? eligibleEvents((await recsys('project', { user: u, catalog: rawCatalog, context })).candidates,u) : availableCatalog;
      const view = await recsys('view', { user: u, catalog: feedCatalog, context });
      Object.assign(u, view.user);
      await store.saveUser(u);
      return json(res, 200, { user: { ...u, recommendation:{...u.recommendation,interactions:[]} }, recommendations: view.recommendations,
        ...(u.onboarded ? {catalog:feedCatalog.map(publicEvent)} : {}) });
    }
    if(url.pathname === '/api/recommendations/signals') {
      if(req.method!=='POST' || data.action!=='open_detail' || !u.registered) fail('Некорректный сигнал.');
      const event=await selectedEvent(data.eventId,data.selectedVacancyId);
      if(!event) fail('Это дело больше недоступно.',404);
      await feedback({eventId:data.eventId,action:'open_detail',context:'detail'},[event]);
      return json(res,200,{ok:true});
    }
    if (url.pathname === "/api/me" && req.method === "DELETE") {
      await store.deleteUser(u.id);
      res.setHeader(
        "Set-Cookie",
        `first_session=; HttpOnly; SameSite=Lax; Path=${demoCookiePath}; Max-Age=0`,
      );
      return json(res, 200, { ok: true });
    }
    if (url.pathname === "/api/plans" && req.method === "POST") {
      if (!u.registered) fail("Сначала закончи регистрацию.", 403);
      const event = await selectedEvent(data.eventId,data.selectedVacancyId);
      if (!event && rawCatalog.some(e=>e.id===data.eventId)) fail('Это событие недоступно для твоего профиля или выбранного города.',403);
      if (event && !eventAllowedForUser(event, u))
        fail("Это событие не подходит по возрастному ограничению.", 403);
      const fields = validatePlan(data, event);
      const existing = (await mine(u, catalog)).find(
        (p) =>
          p.eventId === data.eventId &&
          !["done", "cancelled"].includes(p.status),
      );
      if (existing) return json(res, 200, existing);
      const p = {
        id: randomUUID(),
        owner: u.id,
        eventId: event.id,
        selectedVacancyId: event.selectedVacancyId || null,
        eventSnapshot: publicEvent(event),
        ...fields,
        status: "draft",
        checks: [],
        members: [],
        createdAt: new Date().toISOString(),
        reflection: null,
      };
      const created = await store.createPlan(p);
      if (!created.created) return json(res, 200, viewPlan(created.plan, u, catalog));
      await feedback({eventId:event.id,action:'like',context:'plan',planId:p.id},[event]);
      await store.saveUser(u);
      return json(res, 201, viewPlan(p, u, catalog));
    }
    const match = url.pathname.match(
      /^\/api\/plans\/([^/]+)(?:\/(invite|leave))?$/,
    );
    if (match) {
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(match[1])) fail("Некорректный идентификатор плана.", 400);
      const p = await store.plan(match[1]);
      if (!p || (p.owner !== u.id && !p.members.some((m) => m.id === u.id)))
        fail("План не найден.", 404);
      if (match[2] === "leave" && req.method === "POST") {
        if (p.owner === u.id) fail("Владелец может отменить план.");
        await store.leavePlan(p.id, u.id);
        return json(res, 200, { ok: true });
      }
      if (p.owner !== u.id) fail("Изменить план может его автор.", 403);
      if (match[2] === "invite" && req.method === "POST") {
        if (["done", "cancelled"].includes(p.status)) fail("Этот план закрыт.");
        const shareInMax = data.shareInMax === true;
        if (shareInMax && (!u.id.startsWith("max:") || !token || !botUsername || !appUrl.startsWith("https://")))
          fail("Приглашение с картинкой доступно внутри MAX.", 403);
        if (!shareInMax) await store.revoke(p.id);
        const code = randomBytes(18).toString("hex");
        await store.saveInvite(code, p.id, Date.now() + 7 * 86400000);
        if (shareInMax) {
          try {
            const event = p.eventSnapshot || rawCatalog.find((item) => item.id === p.eventId) || await catalogRepository.event(p.eventId);
            const mid = await sendInviteMessage(token, u.id.slice(4), {
              ownerName: u.name, event, code, botUsername, appUrl,
            });
            return json(res, 201, { mid, chatType: "DIALOG" });
          } catch (error) {
            console.error(`MAX invitation delivery failed: ${error.message}`);
            fail("Не удалось подготовить приглашение в MAX. Попробуй ещё раз или открой чат с ботом и нажми /start.", 502);
          }
        }
        return json(res, 201, { code });
      }
      if (match[2] === "invite" && req.method === "DELETE") {
        await store.revoke(p.id);
        return json(res, 200, { ok: true });
      }
      if (!match[2] && req.method === "PATCH") {
        if (["done", "cancelled"].includes(p.status))
          fail("Этот план уже закрыт.");
        if (data.status === "cancelled") {
          p.status = "cancelled";
          await store.revoke(p.id);
          const historicalEvent = p.eventSnapshot || catalog.find(e=>e.id===p.eventId) || await catalogRepository.event(p.eventId);
          if(historicalEvent) await feedback({eventId:p.eventId,action:'cancel_plan',context:'plan',planId:p.id},[historicalEvent]);
        } else if (data.status === "done") {
          if (!p.when || Date.parse(p.when) > Date.now() || !p.confirmed)
            fail("Отметить визит можно после согласованной даты.");
          if (!["warm", "okay", "hard"].includes(data.reflection))
            fail("Выберите, как прошёл визит.");
          p.hours = validateHours(data.hours);
          p.status = "done";
          p.reflection = data.reflection;
          p.completedAt = new Date().toISOString();
          await store.revoke(p.id);
        } else {
          Object.assign(
            p,
            validatePlan(
              { ...p, ...data },
              p.eventSnapshot || catalog.find((e) => e.id === p.eventId),
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
        await store.savePlan(p, {onlyOpen:true});
        if(p.status==='done') {
          const historicalEvent=p.eventSnapshot||catalog.find(e=>e.id===p.eventId)||await catalogRepository.event(p.eventId);
          if(historicalEvent) await feedback({eventId:p.eventId,action:'like',context:'visit',planId:p.id},[historicalEvent]);
        }
        if(['done','cancelled'].includes(p.status)) await store.saveUser(u);
        return json(res, 200, viewPlan(p, u, catalog));
      }
    }
    const invite = url.pathname.match(/^\/api\/invites\/([a-f0-9]{36})$/);
    if (invite) {
      const i = await store.invite(invite[1]);
      let p = i && await store.plan(i.plan);
      if (
        !p ||
        i.expires < Date.now() ||
        ["done", "cancelled"].includes(p.status)
      )
        fail(
          "Приглашение истекло или отозвано. Попросите друга прислать новое.",
          410,
        );
      if (req.method === "GET") {
        const invitedEvent = p.eventSnapshot || rawCatalog.find((e) => e.id === p.eventId) || await catalogRepository.event(p.eventId);
        if (!invitedEvent) fail("Дело из приглашения больше недоступно.", 410);
        return json(res, 200, {
          event: publicEvent(invitedEvent),
          when: p.when,
          confirmed: p.confirmed,
          ownerName: (await store.user(p.owner))?.name || "Друг",
          joined: p.owner === u.id || p.members.some((m) => m.id === u.id),
        });
      }
      if (req.method === "POST") {
        if (!u.registered) fail("Сначала закончи регистрацию.", 403);
        const invitedEvent = p.eventSnapshot || rawCatalog.find((e) => e.id === p.eventId) || await catalogRepository.event(p.eventId);
        if (invitedEvent && !eventAllowedForUser(invitedEvent, u))
          fail("Это событие не подходит по возрастному ограничению.", 403);
        if (p.owner !== u.id && !p.members.some((m) => m.id === u.id)) {
          const joined = await store.joinPlan(p.id, u);
          if (joined.full) fail("Компания уже собралась: не больше четырёх человек.");
          p = await store.plan(p.id);
        }
        return json(res, 200, viewPlan(p, u, catalog));
      }
    }
    fail("Не найдено.", 404);
  } catch (e) {
    // Domain/input errors are ordinary 4xx responses; PostgreSQL/driver errors
    // carry a `code` and must remain 500 without leaking implementation details.
    const status = Number.isInteger(e.status) && e.status >= 400 && e.status < 600
      ? e.status
      : e?.code
        ? 500
        : 400;
    if (status === 500) console.error("Request failed:", e);
    json(res, status, { error: status === 500 ? "Ошибка сервера. Попробуйте ещё раз." : e.message });
  }
});
server.listen(
  Number(process.env.PORT || 3210),
  process.env.HOST || "127.0.0.1",
  () =>
    console.log(
      `хелпи MAX: http://${process.env.HOST || "127.0.0.1"}:${process.env.PORT || 3210} (${demo ? "demo" : "max"})`,
    ),
);
if (token) {
  const catalog = () => catalogRepository.listActive();
  if (!demo) startDailyDigestLoop({ token, appUrl, botUsername, store, catalogRepository });
  // MAX Webhook is configured by scripts/setup-webhook.js. Long Polling is
  // intentionally opt-in for local development and must not run with a webhook.
  if (process.env.MAX_POLLING === "true" || (!webhookUrl && process.env.MAX_POLLING !== "false"))
    startPolling({ token, appUrl, botUsername, store, catalog, catalogRepository }).catch((error) => console.error(error));
}
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => server.close(async () => {
    await store.close().catch(() => {});
    process.exit(0);
  }));
