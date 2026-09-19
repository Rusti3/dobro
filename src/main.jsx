import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Leaf,
  Heart,
  Users,
  CalendarDays,
  Compass,
  Check,
  MapPin,
  Clock,
  ChevronRight,
  Copy,
  ExternalLink,
  Plus,
  Sprout,
  Flower2,
  HandHeart,
  MessageCircle,
  Search,
  BookOpen,
  X,
  Settings,
  ShieldCheck,
  RefreshCw,
} from "lucide-react";
import "./style.css";
import Garden from './Garden.jsx';
const tg = window.Telegram?.WebApp;
async function api(url, method = "GET", body) {
  const r = await fetch("/api" + url, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(tg?.initData ? { "X-Telegram-Init-Data": tg.initData } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok)
    throw new Error(data.error || "Не удалось сохранить. Попробуйте ещё раз.");
  return data;
}
const categories = { all: "Всё добро", animals: "Животным", people: "Людям" };
const themeMeta = {
  animals: ["🐶", "Животные", "Забота о тех, кто ждёт своего человека"],
  ecology: ["🌱", "Экология", "Чистая среда и бережные привычки"],
  elderly: ["👵", "Пожилые", "Общение, внимание и тёплые встречи"],
  children: ["🧒", "Дети", "Поддержка, игры и новые возможности"],
  city: ["🏙", "Помощь городу", "Делать свой район удобнее и добрее"],
  creativity: ["🎨", "Творчество", "Мастерские, музыка, фото и культура"],
  activity: ["🏃", "Активности", "Движение, спорт и выезды"],
  education: ["🎓", "Образование", "Делиться знаниями и быть наставником"],
  events: ["🤝", "Мероприятия", "Помогать команде на событиях"],
  online_help: ["💻", "Онлайн-помощь", "Дизайн, тексты и помощь из дома"],
  donation: ["🩸", "Донорство", "Поддержать тех, кому нужна кровь"],
  recycling: ["♻️", "Переработка", "Сбор вещей и вторсырья"],
  nature: ["🌳", "Природа", "Парки, леса, берега и животный мир"],
  charity: ["❤️", "Благотворительность", "Адресная и гуманитарная помощь"],
};
const interestOptions = [
  "animals", "ecology", "elderly", "children", "city", "creativity", "activity",
  "education", "events", "online_help", "donation", "recycling", "nature", "charity",
].map((id) => [id, ...themeMeta[id]]);
const dateLabel = (d) =>
  d
    ? new Date(d).toLocaleString("ru-RU", {
        day: "numeric",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Europe/Moscow",
      }) + " · МСК"
    : "Дату согласуем с организатором";
const live = (e) => Date.parse(e.endsAt) > Date.now();
const themeTitle = (event) => themeMeta[event.theme]?.[1] || categories[event.category] || "Доброе дело";
function Plant({ stage = 2, small = false }) {
  return (
    <svg
      className={small ? "plant small" : "plant"}
      viewBox="0 0 360 320"
      fill="none"
      aria-hidden="true"
    >
      <ellipse cx="180" cy="276" rx="117" ry="17" fill="#dbdec7" />
      <path
        d="M81 265C111 253 133 270 151 261S201 261 224 265 259 258 277 266"
        stroke="#667f58"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M177 262C173 222 199 185 184 133"
        stroke="#365a3e"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M186 192C137 195 109 174 108 139 155 132 185 151 186 192Z"
        fill="#759857"
      />
      <path
        d="M183 161C223 159 245 132 240 98 196 100 180 123 183 161Z"
        fill="#476d43"
      />
      <path
        d="M183 190 136 157M185 157 222 119"
        stroke="#e6ecd0"
        strokeWidth="2"
        strokeLinecap="round"
      />
      {stage > 1 && (
        <>
          <path
            d="M181 133C143 126 141 88 150 66 187 82 192 104 181 133Z"
            fill="#a1b674"
          />
          <path d="M181 129 160 88" stroke="#f5f5ed" strokeWidth="2" />
        </>
      )}
      {stage > 2 && (
        <>
          <circle cx="231" cy="72" r="17" fill="#e8ab82" />
          <circle cx="255" cy="83" r="17" fill="#e8ab82" />
          <circle cx="249" cy="109" r="17" fill="#e8ab82" />
          <circle cx="222" cy="109" r="17" fill="#e8ab82" />
          <circle cx="211" cy="84" r="17" fill="#e8ab82" />
          <circle cx="232" cy="90" r="13" fill="#f4d399" />
        </>
      )}
      <path
        d="M108 90v12m-6-6h12M268 167v12m-6-6h12"
        stroke="#a4ad84"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="103" cy="224" r="4" fill="#d8a079" />
      <circle cx="269" cy="53" r="4" fill="#d8a079" />
      <path
        d="M223 252q8-21 19-13M130 254q-12-24-23-20"
        stroke="#96a46c"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
function App() {
  const [data, setData] = useState(null),
    [fatal, setFatal] = useState(""),
    [tab, setTab] = useState(() => {
      const requested = new URLSearchParams(location.search).get("tab") || "home";
      return requested === "discover" ? "home" : requested;
    }),
    [detail, setDetail] = useState(null),
    [onboard, setOnboard] = useState(false),
    [profile, setProfile] = useState({ category: "all", barrier: "company" }),
    [interestSelection, setInterestSelection] = useState([]),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState(""),
    [toast, setToast] = useState(""),
    [busy, setBusy] = useState(false),
    [invite, setInvite] = useState(null),
    [inviteError, setInviteError] = useState(""),
    [settings, setSettings] = useState(false),
    [share, setShare] = useState(""),
    [calibrationDone, setCalibrationDone] = useState(false),
    [showCatalog, setShowCatalog] = useState(false);
  const [swipeDrag, setSwipeDrag] = useState(0),
    [swipeStart, setSwipeStart] = useState(null);
  const inviteCode =
    new URLSearchParams(location.search).get("invite") ||
    tg?.initDataUnsafe?.start_param?.replace(/^i_/, "");
  async function load() {
    try {
      const d = await api("/bootstrap");
      setData(d);
      setProfile(d.user.profile);
      setInterestSelection(d.user.profile.interests || []);
      setOnboard(d.recommendations?.stage === "interests");
      setFatal("");
    } catch (e) {
      setFatal(e.message);
    }
  }
  useEffect(() => {
    tg?.ready();
    tg?.expand();
    load();
    if (inviteCode)
      api("/invites/" + inviteCode)
        .then(setInvite)
        .catch((e) => setInviteError(e.message));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const back = () => {
      setDetail(null);
      if (data?.user?.interestOnboarded) setOnboard(false);
      setSettings(false);
    };
    if (detail || onboard || settings) {
      tg?.BackButton?.show();
      tg?.BackButton?.onClick(back);
    } else tg?.BackButton?.hide();
    return () => tg?.BackButton?.offClick(back);
  }, [detail, onboard, settings, data?.user?.interestOnboarded]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, detail, onboard, settings]);
  useEffect(() => {
    if (data?.recommendations?.stage === "feed") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [data?.recommendations?.stage]);
  async function act(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setToast(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      setToast("Скопировано. Можно отправить, когда будешь готов.");
    } catch {
      setShare(text);
    }
  }
  function go(t) {
    const nextTab = t === "discover" ? "home" : t;
    setTab(nextTab);
    setDetail(null);
    setOnboard(false);
    setSettings(false);
    setShare("");
  }
  async function save(patch) {
    await api("/profile", "PATCH", patch);
    await load();
  }
  async function plan(e) {
    await act(async () => {
      await api("/plans", "POST", {
        eventId: e.id,
        mode: profile.barrier === "company" ? "friend" : "solo",
      });
      await load();
      go("plan");
      setToast("Первый шаг сохранён. Начни с сообщения организатору.");
    });
  }
  async function update(id, patch) {
    await act(async () => {
      await api("/plans/" + id, "PATCH", patch);
      await load();
      if(patch.status === 'done') {
        go('garden');
        setToast('Новое растение в твоём саду · +100 воды' + (patch.hours ? ` · +${patch.hours * 50} солнца` : ''));
      } else setToast("План обновлён");
    });
  }
  async function inviteFriend(p) {
    await act(async () => {
      const { code } = await api(`/plans/${p.id}/invite`, "POST", {});
      const url = data.botUsername
        ? `https://t.me/${data.botUsername}?start=i_${code}`
        : `${location.origin}/?invite=${code}`;
      setShare(url);
      await copy(url);
    });
  }
  if (fatal)
    return (
      <main className="error-page">
        <Sprout size={48} />
        <h1>Не получилось загрузить</h1>
        <p>{fatal}</p>
        <button onClick={load} className="primary">
          <RefreshCw size={18} /> Попробовать снова
        </button>
      </main>
    );
  if (!data)
    return (
      <main className="error-page">
        <Sprout className="loading" size={48} />
        <p>Готовим твой первый шаг…</p>
      </main>
    );
  const active = data.plans.filter(
    (p) => !["cancelled", "done"].includes(p.status),
  );
  const done = data.plans.filter((p) => p.status === "done");
  const chosen = data.catalog.filter(live);
  const catalogById = new Map(data.catalog.map((event) => [event.id, event]));
  const recommendations = data.recommendations || { stage: "interests" };
  const calibrationItem = recommendations.stage === "calibration"
    ? recommendations.items?.[recommendations.completed]
    : null;
  const dailyResponded = new Set(recommendations.daily?.feedback?.map((item) => item.eventId) || []);
  const dailyId = recommendations.daily?.ids?.find((id) => !dailyResponded.has(id));
  const swipeEvent = catalogById.get(calibrationItem?.id || dailyId);
  const swipeContext = recommendations.stage === "calibration" ? "calibration" : "daily";
  async function sendFeedback(action) {
    if (!swipeEvent || busy) return;
    setSwipeDrag(0);
    await act(async () => {
      const result = await api("/recommendations/feedback", "POST", { eventId: swipeEvent.id, action, context: swipeContext });
      setData((current) => ({ ...current, user: result.user, recommendations: result.recommendations }));
      setProfile(result.user.profile);
      if (swipeContext === "calibration" && result.recommendations.stage !== "calibration") setCalibrationDone(true);
    });
  }
  const nav = [
    ["home", Compass, "Добрые дела"],
    ["garden", Flower2, "Мой сад"],
    ["together", Users, "Вместе"],
    ["plan", CalendarDays, "Мой план"],
  ];
  function Card({ e, featured = false }) {
    return (
      <button
        className={`event-card ${featured ? "featured" : ""}`}
        onClick={() => setDetail(e)}
      >
        <div className="event-photo">
          {e.image ? (
            <img src={e.image} alt="" loading="lazy" />
          ) : (
            <Plant small />
          )}
          <span className="photo-tag">
            {e.category === "animals" ? (
              <Heart size={13} />
            ) : (
              <HandHeart size={13} />
            )}{" "}
            {themeTitle(e)}
          </span>
          <span className="photo-arrow">
            <ArrowUpRight size={19} />
          </span>
        </div>
        <div className="event-body">
          <span className="event-support">
            <span /> {e.support}
          </span>
          <h3>{e.short}</h3>
          <p>{e.intro}</p>
          <div className="event-meta">
            <span>
              <MapPin size={14} />
              {e.city}
            </span>
            <span>Дату уточняем</span>
          </div>
        </div>
      </button>
    );
  }
  function CatalogFeed() {
    const events = data.catalog
      .filter(live)
      .filter(
        (event) =>
          (filter === "all" || event.theme === filter) &&
          `${event.title} ${event.description}`.toLowerCase().includes(query.toLowerCase()),
      );
    const sections = recommendations.sections || [{ id: "all", title: "Для тебя", subtitle: "Актуальные дела", eventIds: chosen.slice(0, 6).map((event) => event.id) }];
    return <section className="daily-feed">
      <div className="feed-heading"><div><span className="eyebrow">ТВОЯ ПЕРСОНАЛЬНАЯ ЛЕНТА</span><h1>Есть несколько хороших вариантов</h1><p className="lead">Лента учитывает темы и твои реакции. Чем больше выборов, тем точнее порядок.</p></div><span className="tomorrow-note"><Sprout size={15}/> Новая подборка завтра</span></div>
      {recommendations.taste?.length > 0 && <div className="taste-row"><span>Сейчас тебе ближе:</span>{recommendations.taste.map((item) => <span className="taste-pill" key={item.id}>{themeMeta[item.id]?.[0]} {themeMeta[item.id]?.[1]} · {Math.round(item.weight * 100)}%</span>)}</div>}
      <div className="feed-sections">
        {sections.map((section) => {
          const items = section.eventIds.map((id) => catalogById.get(id)).filter(Boolean);
          if (!items.length) return null;
          return <section className="feed-block" key={section.id}>
            <div className="section-head"><div><h2>{section.title}{section.id === "taste" ? " 🌱" : ""}</h2><p>{section.subtitle}</p></div><span>{items.length} вариантов</span></div>
            <div className="feed-rail">{items.map((event) => <Card key={event.id} e={event}/>)}</div>
          </section>;
        })}
      </div>
      <section className="all-events">
        <div className="catalog-callout"><div><span className="eyebrow">ВСЕ ДОБРЫЕ ДЕЛА</span><h2>{showCatalog ? "Весь каталог" : "Хочется посмотреть всё?"}</h2><p>{showCatalog ? "Фильтруй по теме или найди дело по слову." : `Ещё ${chosen.length} актуальных возможностей из выгрузки ДОБРО.`}</p></div><button className="secondary" onClick={() => setShowCatalog((value) => !value)}>{showCatalog ? "Свернуть каталог" : "Открыть каталог"} <ArrowRight size={16}/></button></div>
        {showCatalog && <><div className="filter-row">
          <div className="chips"><button className={filter === "all" ? "chip active" : "chip"} onClick={() => setFilter("all")}>Все</button>{Object.entries(themeMeta).map(([value, [, title]]) => <button key={value} className={filter === value ? "chip active" : "chip"} onClick={() => setFilter(value)}>{title}</button>)}</div>
          <label className="search"><Search size={17}/><input aria-label="Поиск добрых дел" placeholder="Найти своё…" value={query} onChange={(event) => setQuery(event.target.value)}/></label>
        </div>
        <div className="catalog-meta"><span><MapPin size={14}/>Москва · {events.length} дел</span><span>Данные ДОБРО от 09.09.2026</span></div>
        {events.length ? <div className="cards catalog">{events.map((event) => <Card key={event.id} e={event}/>)}</div> : <div className="empty"><Search size={32}/><h2>Пока ничего не нашлось</h2><p>Попробуй другое слово или верни все направления.</p><button className="secondary" onClick={() => { setFilter("all"); setQuery(""); }}>Сбросить фильтры</button></div>}</>}
      </section>
      <p className="source-caption">Это подборка возможностей, а не подтверждённых смен. У каждой карточки есть источник и понятный следующий шаг.</p>
    </section>;
  }
  function SwipeExperience() {
    if (!swipeEvent) return <CatalogFeed />;
    const calibration = swipeContext === "calibration";
    const completed = calibration ? recommendations.completed : recommendations.daily.completed;
    const target = calibration ? recommendations.target : recommendations.daily.target;
    const reason = calibrationItem?.reason || "Подобрали на сегодня";
    return <section className={`swipe-home ${calibration ? "calibration-swipe" : ""}`}>
      <div className="swipe-intro">
        <div><span className="eyebrow">{calibration ? "ШАГ 2 ИЗ 2 · НАСТРАИВАЕМ ТВОЙ ВКУС" : "РЕКОМЕНДАЦИИ НА СЕГОДНЯ"}</span><h1>{calibration ? "Куда ты действительно мог бы пойти?" : "Что откликается сегодня?"}</h1><p>{calibration ? "Свайпай вправо, если вариант подходит. Влево — если не твоё. Так мы поймём формат, компанию и темп без длинной анкеты." : "Каждый выбор помогает точнее собрать завтрашнюю подборку."}</p></div>
        <span className="swipe-count">{completed + 1} / {target}</span>
      </div>
      <div className="swipe-progress" aria-label={`Пройдено ${completed} из ${target}`}>{Array.from({ length: target }, (_, index) => <span className={index < completed ? "done" : index === completed ? "current" : ""} key={index}/>)}</div>
      <div className="swipe-deck" onPointerDown={(event) => { setSwipeStart(event.clientX); event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (swipeStart !== null) setSwipeDrag(event.clientX - swipeStart); }} onPointerUp={() => { if (Math.abs(swipeDrag) > 70) sendFeedback(swipeDrag > 0 ? "like" : "skip"); else setSwipeDrag(0); setSwipeStart(null); }} onPointerCancel={() => { setSwipeDrag(0); setSwipeStart(null); }}>
        <div className="swipe-home-card" style={{ transform: `translateX(${swipeDrag}px) rotate(${swipeDrag / 22}deg)` }}>
          <div className="swipe-home-media">{swipeEvent.image ? <img src={swipeEvent.image} alt=""/> : <Plant/>}<span className="swipe-home-label">{themeMeta[swipeEvent.theme]?.[0]} {themeTitle(swipeEvent)}</span><span className="swipe-reason">{reason}</span>{Math.abs(swipeDrag) > 34 && <span className={`swipe-verdict ${swipeDrag > 0 ? "yes" : ""}`}>{swipeDrag > 0 ? "ХОЧУ" : "НЕ МОЁ"}</span>}</div>
          <div className="swipe-home-copy"><span className="event-support"><span/> {swipeEvent.support}</span><h2>{swipeEvent.short}</h2><p>{swipeEvent.intro}</p><div className="trait-row"><span>{swipeEvent.traits?.format === "online" ? "Онлайн" : "Офлайн"}</span><span>{swipeEvent.traits?.social === "group" ? "В компании" : "Можно одному"}</span><span>{swipeEvent.traits?.duration === "short" ? "Около часа" : swipeEvent.traits?.duration === "long" ? "Регулярно" : "1–3 часа"}</span></div><button className="text-button" onClick={() => setDetail(swipeEvent)}>Подробнее <ArrowUpRight size={15}/></button></div>
        </div>
      </div>
      <div className="swipe-home-actions"><button className="swipe-round skip" disabled={busy} onClick={() => sendFeedback("skip")} aria-label="Не моё"><X size={22}/></button><span>{busy ? "Запоминаем выбор…" : "Влево — не моё · вправо — хочу"}</span><button className="swipe-round like" disabled={busy} onClick={() => sendFeedback("like")} aria-label="Мне подходит"><Heart size={22}/></button></div>
    </section>;
  }
  function CalibrationComplete() {
    const top = recommendations.taste || [];
    return <section className="calibration-complete"><div className="complete-orbit"><Sprout size={42}/><span>✨</span></div><span className="eyebrow">ПРОФИЛЬ ГОТОВ</span><h1>Мы собрали твою ленту</h1><p>Темы задали направление, а 12 выборов помогли понять удобный формат, темп и компанию.</p>{top.length > 0 && <div className="taste-row">{top.map((item) => <span className="taste-pill" key={item.id}>{themeMeta[item.id]?.[0]} {themeMeta[item.id]?.[1]}</span>)}</div>}<button className="primary" onClick={() => setCalibrationDone(false)}>Посмотреть рекомендации <ArrowRight size={18}/></button></section>;
  }
  function Empty({
    title,
    text,
    action = "Найти своё дело",
    target = "discover",
  }) {
    return (
      <div className="empty">
        <Sprout size={38} />
        <h2>{title}</h2>
        <p>{text}</p>
        <button className="primary" onClick={() => go(target)}>
          {action}
          <ArrowRight size={17} />
        </button>
      </div>
    );
  }
  function PlanItem({ p }) {
    const owner = p.owner === data.user.id;
    const [when, setWhen] = useState(
        p.when
          ? new Date(Date.parse(p.when) + 3 * 3600000)
              .toISOString()
              .slice(0, 16)
          : "",
      ),
      [meeting, setMeeting] = useState(p.meeting),
      [confirmed, setConfirmed] = useState(p.confirmed),
      [cancel, setCancel] = useState(false),
      [hours, setHours] = useState('');
    return (
      <article className="plan-item">
        <div className="plan-cover">
          <span className="eyebrow">
            {owner ? "ТВОЙ ПЕРВЫЙ ШАГ" : "ВЫ ИДЁТЕ ВМЕСТЕ"}
          </span>
          <h2>{p.event.short}</h2>
          <p>
            <CalendarDays size={17} />
            {dateLabel(p.when)}
          </p>
          <span className="pill">
            {p.status === "ready"
              ? "Согласование отмечено тобой"
              : "Ожидает согласования"}
          </span>
        </div>
        <div className="plan-content">
          <div className="section-head">
            <h3>До встречи — три маленьких шага</h3>
            <span>{p.checks.length}/3</span>
          </div>
          {[
            [
              "contact",
              "Написать организатору",
              "Согласуй дату, задачи и длительность.",
            ],
            [
              "route",
              "Узнать, где встретят",
              "Точный адрес, имя координатора и ориентир.",
            ],
            [
              "bag",
              "Подготовиться без спешки",
              "Уточни одежду, документы и что взять с собой.",
            ],
          ].map(([id, title, text], i) => (
            <div className="check-row" key={id}>
              <button
                disabled={!owner || busy}
                aria-label={title}
                aria-pressed={p.checks.includes(id)}
                className={"check " + (p.checks.includes(id) ? "checked" : "")}
                onClick={() =>
                  update(p.id, {
                    checks: p.checks.includes(id)
                      ? p.checks.filter((x) => x !== id)
                      : [...p.checks, id],
                  })
                }
              >
                {p.checks.includes(id) ? <Check size={17} /> : i + 1}
              </button>
              <div>
                <strong>{title}</strong>
                <p>{text}</p>
                {id === "contact" && (
                  <button
                    className="text-button"
                    onClick={() => setDetail(p.event)}
                  >
                    Подготовить сообщение <ArrowUpRight size={14} />
                  </button>
                )}
              </div>
            </div>
          ))}
          <hr />
          <h3>Конкретный план помогает дойти</h3>
          <p className="muted">
            Заполни после ответа организатора. Это личный план, а не запись на
            мероприятие.
          </p>
          {owner ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                update(p.id, {
                  when: when
                    ? new Date(when + ":00+03:00").toISOString()
                    : null,
                  meeting,
                  confirmed,
                });
              }}
            >
              <label>
                Дата и время · Москва (UTC+3)
                <input
                  type="datetime-local"
                  value={when}
                  onChange={(e) => setWhen(e.target.value)}
                  required
                />
              </label>
              <label>
                Где встречаемся и кто встретит
                <input
                  placeholder="Например: у входа, координатор Анна"
                  maxLength={240}
                  value={meeting}
                  onChange={(e) => setMeeting(e.target.value)}
                />
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Я согласовал(а) визит с организатором
              </label>
              <button className="primary" disabled={busy}>
                Сохранить договорённость <Check size={16} />
              </button>
            </form>
          ) : (
            <p className="notice">
              {p.meeting || "Автор приглашения пока не указал место встречи."}{" "}
              Каждый участник отдельно уточняет регистрацию у организатора.
            </p>
          )}
          <hr />
          <div className="section-head">
            <h3>Свой человек рядом</h3>
            <Users size={20} />
          </div>
          <p className="muted">
            {p.members.length
              ? `В компании: ${p.members.map((m) => m.name).join(", ")}.`
              : "Друг ещё не присоединился. Пригласи того, с кем тебе спокойно."}
          </p>
          {owner ? (
            <div className="button-row">
              <button
                className="secondary"
                disabled={busy}
                onClick={() => inviteFriend(p)}
              >
                <Plus size={16} />
                Пригласить друга
              </button>
              <button
                className="text-button"
                onClick={() =>
                  act(async () => {
                    await api(`/plans/${p.id}/invite`, "DELETE", {});
                    setShare("");
                    setToast("Ссылки приглашения отозваны");
                  })
                }
              >
                Отозвать ссылку
              </button>
            </div>
          ) : (
            <button
              className="secondary"
              onClick={() =>
                act(async () => {
                  await api(`/plans/${p.id}/leave`, "POST", {});
                  await load();
                })
              }
            >
              Выйти из компании
            </button>
          )}
          {share && (
            <label className="share-box">
              Отправь другу лично. Ссылка действует 7 дней.
              <textarea readOnly value={share} />
            </label>
          )}
          {p.when && (
            <button
              className="text-button calendar-link"
              onClick={() => {
                const dt = new Date(p.when)
                  .toISOString()
                  .replace(/[-:]/g, "")
                  .replace(/\.\d{3}Z$/, "Z");
                const esc = (v) =>
                  String(v)
                    .replaceAll("\\", "\\\\")
                    .replaceAll("\n", "\\n")
                    .replaceAll(",", "\\,")
                    .replaceAll(";", "\\;");
                const blob = new Blob(
                  [
                    `BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//First Step//RU\r\nBEGIN:VEVENT\r\nUID:${p.id}@firststep\r\nDTSTAMP:${new Date()
                      .toISOString()
                      .replace(/[-:]/g, "")
                      .replace(
                        /\.\d{3}Z$/,
                        "Z",
                      )}\r\nDTSTART:${dt}\r\nSUMMARY:${esc(p.event.short)}\r\nDESCRIPTION:${esc("Личный план. Участие согласовать с организатором. " + p.event.url)}\r\nLOCATION:${esc(p.meeting)}\r\nEND:VEVENT\r\nEND:VCALENDAR`,
                  ],
                  { type: "text/calendar;charset=utf-8" },
                );
                const a = document.createElement("a");
                a.href = URL.createObjectURL(blob);
                a.download = "perviy-shag.ics";
                a.click();
                setTimeout(() => URL.revokeObjectURL(a.href), 1000);
              }}
            >
              <CalendarDays size={17} />
              Добавить в календарь
            </button>
          )}
          {owner && (
            <>
              <hr />
              {p.confirmed && p.when && Date.parse(p.when) <= Date.now() ? (
                <div>
                  <h3>Как всё прошло?</h3>
                  <label>Сколько часов ты помогал(а)? Необязательно.
                    <input type="number" min="0" max="24" step="0.5" value={hours} placeholder="Например, 2" onChange={e=>setHours(e.target.value)}/>
                  </label>
                  <p className="muted">
                    Твоя отметка останется личной. Это не подтверждение
                    волонтёрских часов.
                  </p>
                  <div className="button-row">
                    {[
                      ["warm", "Было тепло"],
                      ["okay", "Нормально"],
                      ["hard", "Было непросто"],
                    ].map(([v, t]) => (
                      <button
                        className="secondary"
                        key={v}
                        onClick={() =>
                          update(p.id, { status: "done", reflection: v, hours: hours === '' ? 0 : Number(hours) })
                        }
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="muted small-text">
                  После согласованной даты здесь можно будет сохранить
                  впечатление и вырастить полноценное растение в саду.
                </p>
              )}
              {cancel ? (
                <div className="notice">
                  <p>
                    Отменить личный план? Если ты уже записался, отдельно
                    предупреди организатора и друга.
                  </p>
                  <div className="button-row">
                    <button
                      className="secondary"
                      onClick={() => update(p.id, { status: "cancelled" })}
                    >
                      Да, отменить
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setCancel(false)}
                    >
                      Оставить план
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="text-button cancel"
                  onClick={() => setCancel(true)}
                >
                  Сейчас не получается — отменить план
                </button>
              )}
            </>
          )}
        </div>
      </article>
    );
  }
  let content;
  if (invite || inviteError)
    content = (
      <>
        <button
          className="back"
          onClick={() => {
            setInvite(null);
            setInviteError("");
            history.replaceState(null, "", "/");
          }}
        >
          <ArrowLeft size={17} />К приложению
        </button>
        <div className="invite-page">
          <Users size={42} />
          <span className="eyebrow">ПЕРВЫЙ ШАГ ЛЕГЧЕ ВМЕСТЕ</span>
          <h1>
            {inviteError
              ? "Ссылка больше не действует"
              : `${invite.ownerName} зовёт тебя помочь`}
          </h1>
          <p>{inviteError || invite.event.short}</p>
          {invite && (
            <>
              <p>{dateLabel(invite.when)}</p>
              <p className="notice">
                Приняв приглашение, ты откроешь другу своё имя в Telegram.
                Точное место встречи станет доступно участникам. Регистрация на
                ДОБРО остаётся отдельным шагом.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    await api("/invites/" + inviteCode, "POST", {});
                    await load();
                    setInvite(null);
                    history.replaceState(null, "", "/");
                    go("plan");
                  })
                }
              >
                {invite.joined ? "Открыть общий план" : "Пойду вместе"}
                <ArrowRight size={17} />
              </button>
            </>
          )}
        </div>
      </>
    );
  else if (settings)
    content = (
      <>
        <button className="back" onClick={() => setSettings(false)}>
          <ArrowLeft size={17} />
          Назад
        </button>
        <h1>В твоём темпе</h1>
        <p className="lead">Ты решаешь, когда возвращаться и чем делиться.</p>
        <div className="settings-panel">
          <h3>Напоминание перед визитом</h3>
          <p>
            Одно сообщение в Telegram за сутки или ближе к согласованному
            времени. Включается только по твоему выбору.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              disabled={data.mode === "demo" || busy}
              checked={data.user.reminders}
              onChange={(e) =>
                act(() => save({ reminders: e.target.checked }))
              }
            />
            Напомнить в Telegram
          </label>
          {data.mode === "demo" && (
            <p className="small-text muted">
              Доступно после подключения бота и команды /start.
            </p>
          )}
          <hr />
          <h3>Твои данные</h3>
          <p>
            Храним имя, предпочтения и личные планы. Друг видит имя и общий план
            только после принятия приглашения. Геопозицию и адресную книгу не
            запрашиваем.
          </p>
          <button
            className="secondary"
            onClick={() => {
              setOnboard(true);
              setSettings(false);
              setInterestSelection(profile.interests || []);
            }}
          >
            Изменить предпочтения
          </button>
          <details>
            <summary>Удалить профиль и планы</summary>
            <p>
              Действие удалит твой профиль, созданные планы и участие в
              компаниях.
            </p>
            <button
              className="secondary"
              onClick={() =>
                act(async () => {
                  await api("/me", "DELETE", {});
                  await load();
                  go("home");
                  setToast("Данные удалены");
                })
              }
            >
              Удалить мои данные
            </button>
          </details>
        </div>
      </>
    );
  else if (onboard)
    content = (
      <div className="interest-onboarding" role="dialog" aria-modal="true" aria-labelledby="interest-title">
        <section className="interest-panel">
          {data.user.interestOnboarded && <button className="interest-close" aria-label="Закрыть" onClick={() => setOnboard(false)}><X size={19} /></button>}
          <div className="interest-copy"><span className="eyebrow">ДАВАЙ ЗНАКОМИТЬСЯ · ШАГ 1 ИЗ 2</span><h1 id="interest-title">Что тебе близко?</h1><p>Выбери минимум 5 тем. Это даст ленте хорошую отправную точку.</p></div>
          <div className="interest-grid">
            {interestOptions.map(([id, emoji, title, description], index) => {
              const selected = interestSelection.includes(id);
              const source = data.catalog.find((event) => event.theme === id)?.image || data.catalog[index % data.catalog.length]?.image;
              return <button key={id} className={`interest-card ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => setInterestSelection((current) => selected ? current.filter((item) => item !== id) : [...current, id])}>
                <span className="interest-image" style={{ backgroundImage: source ? `url(${source})` : undefined }}><span className="interest-tint" /><span className="interest-emoji">{emoji}</span>{selected && <span className="interest-check"><Check size={14} strokeWidth={3} /></span>}</span>
                <span className="interest-title">{title}</span><span className="interest-description">{description}</span>
              </button>;
            })}
          </div>
          <div className="interest-actions"><span>{interestSelection.length < 5 ? `Выбери ещё ${5 - interestSelection.length}` : `Выбрано: ${interestSelection.length}`}</span><button className="primary" disabled={busy || interestSelection.length < 5} onClick={() => act(async () => { await api("/profile", "PATCH", { interests: interestSelection }); await load(); setFilter("all"); setOnboard(false); setCalibrationDone(false); go("home"); })}>Настроить ленту <ArrowRight size={18} /></button></div>
        </section>
      </div>
    );
  else if (detail)
    content = (
      <>
        <button className="back" onClick={() => setDetail(null)}>
          <ArrowLeft size={17} />К добрым делам
        </button>
        <article className="detail">
          <div className="detail-image">
            {detail.image && <img src={detail.image} alt={detail.short} />}
            <span className="photo-tag">{themeTitle(detail)}</span>
          </div>
          <div className="detail-main">
            <span className="eyebrow">{detail.city} · ДОБРО</span>
            <h1>{detail.short}</h1>
            <p className="lead">{detail.intro}</p>
            <div className="source-note">
              <ShieldCheck size={21} />
              <div>
                <strong>{detail.support}</strong>
                <p>{detail.why}</p>
              </div>
            </div>
            <h2>Как сделать первый шаг</h2>
            <ol className="first-steps">
              <li>
                <span>01</span>
                <div>
                  <strong>Сначала познакомиться</strong>
                  <p>{detail.first}</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Договориться о понятном визите</strong>
                  <p>
                    Спроси о задачах, длительности, ограничениях и человеке,
                    который встретит. Короткое знакомство возможно только с
                    согласия организатора.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Прийти в своём темпе</strong>
                  <p>
                    Позови друга, если так спокойнее. Предупреди координатора,
                    что вы придёте вдвоём.
                  </p>
                </div>
              </li>
            </ol>
            <div className="message-draft">
              <div className="section-head">
                <h3>
                  <MessageCircle size={19} />
                  Первое сообщение уже готово
                </h3>
                <Copy size={18} />
              </div>
              <p>{`Здравствуйте! Хочу впервые помочь: «${detail.title}». Можно ли прийти новичку? Какие задачи, сколько длится смена, что взять с собой и кто меня встретит? Можно ли прийти с другом? Есть ли ограничения по возрасту или здоровью?`}</p>
              <button
                className="secondary"
                onClick={() =>
                  copy(
                    `Здравствуйте! Хочу впервые помочь: «${detail.title}». Можно ли прийти новичку? Какие задачи, сколько длится смена, что взять с собой и кто меня встретит? Можно ли прийти с другом? Есть ли ограничения по возрасту или здоровью?`,
                  )
                }
              >
                Скопировать сообщение <Copy size={15} />
              </button>
              <a href={detail.url} target="_blank" rel="noreferrer">
                Контакты и запись на ДОБРО <ExternalLink size={15} />
              </a>
            </div>
            <h3>Что известно из источника</h3>
            <dl className="facts">
              <div>
                <dt>Адрес в карточке</dt>
                <dd>{detail.address}</dd>
              </div>
              <div>
                <dt>Период программы</dt>
                <dd>
                  {new Date(detail.startsAt).toLocaleDateString("ru-RU")} —{" "}
                  {new Date(detail.endsAt).toLocaleDateString("ru-RU")}
                </dd>
              </div>
              <div>
                <dt>Длительность и возраст</dt>
                <dd>Уточнить у организатора</dd>
              </div>
            </dl>
            <p className="small-text muted">
              Выгрузка от 9 сентября 2026. Период программы не означает
              ежедневные смены. Свободные места и актуальные условия проверяй на
              странице организатора.
            </p>
            <details>
              <summary>Оригинальное описание ДОБРО</summary>
              <p className="original">{detail.description}</p>
              <a href={detail.url} target="_blank" rel="noreferrer">
                Открыть источник <ExternalLink size={14} />
              </a>
            </details>
            <div className="detail-action">
              <button
                className="primary"
                disabled={busy || !live(detail)}
                onClick={() => plan(detail)}
              >
                {live(detail) ? "Это мой первый шаг" : "Событие завершилось"}
                <ArrowRight size={18} />
              </button>
              <span>
                Сохраним личный план.
                <br />
                Это ещё не регистрация.
              </span>
            </div>
          </div>
        </article>
      </>
    );
  else if (tab === "home")
    content = (
      <>
        {calibrationDone ? <CalibrationComplete /> : ["calibration", "daily"].includes(recommendations.stage) ? <SwipeExperience /> : <CatalogFeed />}
        {recommendations.stage === "feed" && <section className="together-banner">
          <div className="people-mark">
            <span>ты</span>
            <span>+1</span>
          </div>
          <div>
            <h3>«Пойдём со мной?» — иногда этого достаточно.</h3>
            <p>
              Выбери дело и пригласи друга. У вас появится общий план первого
              визита.
            </p>
          </div>
          <button
            className="round-button"
            aria-label="Как пойти вместе"
            onClick={() => go("together")}
          >
            <ArrowUpRight size={22} />
          </button>
        </section>}
      </>
    );
  else if (tab === "plan")
    content = (
      <>
        <span className="eyebrow">ОТ «ХОЧУ» К «Я ИДУ»</span>
        <h1>Мой первый выход</h1>
        <p className="lead">
          Всё важное в одном месте. Можно двигаться маленькими шагами.
        </p>
        {active.length ? (
          active.map((p) => <PlanItem key={p.id} p={p} />)
        ) : (
          <Empty
            title="Здесь появится твой план"
            text="Выбери одно дело. Мы поможем разобраться с деталями, написать организатору и позвать друга."
          />
        )}
        {data.plans.some((p) => p.status === "cancelled") && (
          <p className="notice">
            Ты отменил(а) прошлый план. Это нормально — следующее дело можно
            выбрать, когда будет удобно.
          </p>
        )}
      </>
    );
  else if (tab === "together")
    content = (
      <>
        <span className="eyebrow">ТЕБЕ НЕ ОБЯЗАТЕЛЬНО ИДТИ ОДНОМУ</span>
        <h1>Свой человек рядом</h1>
        <p className="lead">
          Иногда нужен не ещё один список дел, а простое «давай вместе».
        </p>
        <section className="social-hero">
          <div className="people-mark large">
            <span>ты</span>
            <span>друг</span>
          </div>
          <div>
            <h2>
              Пригласи того,
              <br />с кем тебе спокойно.
            </h2>
            <p>
              Друг получит ссылку на дело. После согласия вы увидите общий план
              и сможете договориться о встрече.
            </p>
            <button
              className="primary"
              onClick={() => go(active.length ? "plan" : "discover")}
            >
              {active.length
                ? "Пригласить в мой план"
                : "Выбрать дело для двоих"}
              <ArrowRight size={18} />
            </button>
          </div>
        </section>
        <div className="social-columns">
          <div>
            <h3>
              Маленькая компания,
              <br />а не чат с незнакомцами
            </h3>
            <p>
              До четырёх человек в одном плане. Ссылку отправляешь ты. Её можно
              отозвать в любой момент.
            </p>
          </div>
          <div>
            <h3>Если некому написать</h3>
            <p>
              Выбери дело с вводной встречей. В первом сообщении попроси
              координатора встретить тебя у входа. Это тоже поддержка.
            </p>
            <button
              className="text-button"
              onClick={() =>
                setDetail(data.catalog.find((e) => e.id === "11675000"))
              }
            >
              Посмотреть мастерские <ArrowUpRight size={15} />
            </button>
          </div>
        </div>
        <div className="notice">
          <ShieldCheck size={21} />
          <p>
            Не обещаем случайного «наставника». Сопровождающие от организаций
            появятся после проверки партнёров и согласования конкретных смен.
          </p>
        </div>
      </>
    );
  else content = <Garden data={data} go={go} />;
  return (
    <div className="app">
      <aside className="sidebar">
        <button className="brand" onClick={() => go("home")}>
          <span className="brand-icon">
            <Sprout size={25} />
          </span>
          <span>
            первый шаг<span className="brand-sub">начать помогать — проще</span>
          </span>
        </button>
        <nav aria-label="Основная навигация">
          {nav.map(([id, I, label]) => (
            <button
              className={
                tab === id && !detail && !onboard && !settings
                  ? "nav-item active"
                  : "nav-item"
              }
              key={id}
              onClick={() => go(id)}
            >
              <I size={20} />
              {label}
              {id === "plan" && active.length > 0 && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
        </nav>
        <button
          className="profile-button"
          onClick={() => {
            setSettings(true);
            setDetail(null);
            setOnboard(false);
          }}
        >
          <span className="avatar">{data.user.name.slice(0, 1)}</span>
          <span>
            {data.mode === "demo" ? "Гость" : data.user.name}
            <small>
              {data.mode === "demo"
                ? "Локальный деморежим"
                : "Моё пространство"}
            </small>
          </span>
          <Settings size={17} />
        </button>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span className="mobile-brand">
            <Sprout size={21} />
            первый шаг
          </span>
          <div>
            <span className="location">
              <MapPin size={15} />
              Москва
            </span>
            <button
              className="top-settings"
              aria-label="Настройки"
              onClick={() => {
                setSettings(true);
                setDetail(null);
                setOnboard(false);
              }}
            >
              <Settings size={18} />
            </button>
          </div>
        </header>
        <main
          className="main"
          key={detail?.id || `${tab}-${onboard}-${settings}`}
        >
          {content}
        </main>
        <footer className="app-footer">
          <span>Первый шаг © 2026</span>
          <span>Реальные дела · данные ДОБРО</span>
        </footer>
      </div>
      <nav className="mobile-nav" aria-label="Мобильная навигация">
        {nav.map(([id, I, label]) => (
          <button
            className={tab === id ? "active" : ""}
            key={id}
            onClick={() => go(id)}
          >
            <I size={21} />
            <span>
              {id === "home"
                ? "Дела"
                : id === "plan"
                    ? "План"
                    : label}
            </span>
          </button>
        ))}
      </nav>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label="Закрыть уведомление" onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
      {busy && (
        <div className="busy" role="status">
          Сохраняем…
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
