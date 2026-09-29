import React, { useState, useEffect, useLayoutEffect, useRef, lazy, Suspense } from "react";
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
  Map as MapIcon,
  Clock,
  ChevronRight,
  ChevronDown,
  ExternalLink,
  Plus,
  Sprout,
  HandHeart,
  BookOpen,
  X,
  Settings,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import "./style.css";
import Garden from './Garden.jsx';
import { gardenFor } from './garden-model.js';
import GardenIntro from './GardenIntro.jsx';
import DateRangePicker from './DateRangePicker.jsx';
import { initialTab, launchPayload, launchEventId } from './launch.js';
import { api, maxInitData } from './api.js';
import { themeArtwork } from '../shared/theme-artwork.js';
const mapRetryKey = "first-step-map-chunk-retry";
const VolunteerMap = lazy(async () => {
  try {
    const module = await import("./VolunteerMap.jsx");
    sessionStorage.removeItem(mapRetryKey);
    return module;
  } catch (error) {
    const chunkLoadFailed = /dynamically imported|module script|importing a module/i.test(String(error?.message || error));
    if (chunkLoadFailed && !sessionStorage.getItem(mapRetryKey)) {
      sessionStorage.setItem(mapRetryKey, "1");
      const next = new URL(window.location.href);
      next.searchParams.set("tab", "map");
      window.location.replace(next);
      return new Promise(() => {});
    }
    throw error;
  }
});

class MapErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("Volunteer map failed to render", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return <div className="map-fallback"><MapPin size={28}/><h2>Карта временно не открылась</h2><p>Лента добрых дел продолжает работать. Обнови карту — страница восстановится без белого экрана.</p><button className="primary" onClick={() => { sessionStorage.removeItem(mapRetryKey); window.location.reload(); }}><RefreshCw size={16}/>Обновить карту</button></div>;
  }
}

function HelpiWordmark({ className = "" }) {
  return (
    <span className={`helpi-wordmark ${className}`.trim()}>хелпи</span>
  );
}
// MAX Bridge is injected by the MAX client. The app still renders in a normal
// browser for demo mode, where this value is undefined.
const maxApp = window.WebApp;
const startPayload = launchPayload({ bridgeStartParam: maxApp?.initDataUnsafe?.start_param, hash: location.hash, search: location.search });
const initialEventId = launchEventId(startPayload);
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
// The supplied illustrations stay available even when a topic has no local vacancy.
const interestArtwork = themeArtwork;
const audienceFilters = [
  ["animals", "Животные"],
  ["children", "Дети"],
  ["elderly_people", "Пожилые"],
  ["people_with_disabilities", "Люди с инвалидностью"],
  ["military_personnel", "Военнослужащие"],
  ["environment", "Природа"],
  ["nonprofit_organizations", "НКО"],
];
const cityOptions = [
  { name: "Москва", center: [37.6173, 55.7558], aliases: ["москва"] },
  { name: "Санкт-Петербург", center: [30.3159, 59.9391], aliases: ["санкт-петербург", "петербург", "спб"] },
  { name: "Казань", center: [49.1064, 55.7961], aliases: ["казан"] },
  { name: "Рыбинск", center: [38.8584, 58.0484], aliases: ["рыбинск"] },
];
const cityNames = new Set(cityOptions.map((city) => city.name));
const normalizedPlace = (value) => String(value || "").toLocaleLowerCase("ru-RU").replace(/ё/g, "е");
const eventIsOnline = (event) => ["online", "remote"].includes(event.annotation?.format || event.traits?.format)
  || /онлайн|дистанцион/.test(normalizedPlace(`${event.city} ${event.address} ${event.support}`));
const eventMatchesCity = (event, cityName, includeOnline = true) => {
  if (event.matchedCities?.includes(cityName) && !eventIsOnline(event)) return true;
  if (!includeOnline && eventIsOnline(event)) return false;
  if (includeOnline && eventIsOnline(event)) return true;
  const option = cityOptions.find((city) => city.name === cityName) || cityOptions[0];
  const place = normalizedPlace(`${event.city} ${event.address}`);
  return option.aliases.some((alias) => place.includes(alias));
};
const complexityText = (score) => score === null || score === undefined
  ? "Сложность уточняется"
  : score <= 19 ? "Очень просто"
    : score <= 39 ? "Попроще"
      : score <= 59 ? "Средняя сложность"
        : score <= 79 ? "Потребует опыта"
          : "Сложная задача";
const complexityCardStyle = (score) => {
  if (!Number.isFinite(score)) return undefined;
  const value = Math.max(0, Math.min(100, score));
  const color = value <= 20
    ? "oklch(82% .17 125)"
    : value <= 40
      ? "hsl(76 82% 48%)"
      : value <= 60
        ? "hsl(50 94% 52%)"
        : value <= 80
          ? "hsl(18 88% 60%)"
          : "hsl(0 88% 57%)";
  return { "--difficulty-color": color };
};
const commitmentLabels = {
  one_off: "Один визит", multiple_visits: "Несколько встреч", regular: "Регулярно",
  flexible: "Гибко", unknown: "По договорённости",
};
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
function UserAvatar({ name, photoUrl, className }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  useEffect(() => setPhotoFailed(false), [photoUrl]);
  return <span className={className} aria-hidden="true">
    {(name?.trim()[0] || "Д").toLocaleUpperCase("ru-RU")}
    {photoUrl && !photoFailed && <img src={photoUrl} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)}/>}
  </span>;
}
function PlanSummary({ plan, onOpen }) {
  return <article className="profile-plan-card">
    {plan.demo && <span className="eyebrow">ТЕСТОВОЕ ДЕЛО</span>}
    <span className="eyebrow">{plan.members?.length ? "ВЫ ИДЁТЕ ВМЕСТЕ" : "ЛИЧНЫЙ ПЛАН"}</span>
    <h2>{plan.event?.short || "Доброе дело"}</h2>
    <p className="muted">{plan.when ? dateLabel(plan.when) : "Дата пока не выбрана"} · {plan.status === "ready" ? "Согласовано" : "Нужен ответ организатора"}</p>
    <button className="secondary" onClick={() => onOpen(plan.id)}>Открыть план</button>
  </article>;
}
function ProfilePage({ data, onOpenPlan, onDismissIntro }) {
  const completedCount = gardenFor(data.plans, data.user.id).completed.length;
  const shownCount = completedCount;
  const lastDigit = shownCount % 10;
  const lastTwo = shownCount % 100;
  const deedLabel = lastDigit === 1 && lastTwo !== 11
    ? "доброе дело"
    : [2, 3, 4].includes(lastDigit) && !(lastTwo >= 12 && lastTwo <= 14)
      ? "добрых дела"
      : "добрых дел";
  const displayName = data.user.name || "Друг";
  const activePlans = data.plans.filter((plan) => !["cancelled", "done"].includes(plan.status));
  return <section className="profile-garden-page" aria-label="Профиль и личный сад">
    <Garden data={data}/>
    {!data.user.gardenIntroSeen && <GardenIntro onDismiss={onDismissIntro}/>}
    <header className="profile-garden-hud">
      <div className="profile-hud-person">
        <UserAvatar className="profile-hud-avatar" name={displayName} photoUrl={data.maxProfile?.photoUrl}/>
        <strong>{displayName}</strong>
      </div>
      <div className="profile-hud-progress">
        <div className="profile-hud-deeds" aria-label={`${shownCount} ${deedLabel}`}>
          <span className="profile-hud-sprout" aria-hidden="true"><Sprout size={24}/></span>
          <strong>{shownCount}</strong>
          <span>{deedLabel}</span>
        </div>
      </div>
    </header>
    {activePlans.length > 0 && <details className="profile-plans">
      <summary>Мои планы · {activePlans.length}</summary>
      <div className="profile-plans-list">{activePlans.map((plan) => <PlanSummary key={plan.id} plan={plan} onOpen={onOpenPlan}/>)}</div>
    </details>}
  </section>;
}

function FeedLoadMore({limit,total,onMore}) {
  const sentinel=useRef(null);
  const callback=useRef(onMore);
  callback.current=onMore;
  useEffect(()=>{
    if(!sentinel.current || !window.IntersectionObserver || limit>=total) return;
    let disposed=false;
    const observer=new IntersectionObserver(([entry])=>{
      if(!disposed && entry.isIntersecting) { disposed=true; observer.disconnect(); callback.current(); }
    },{rootMargin:'600px 0px'});
    observer.observe(sentinel.current);
    return ()=>{disposed=true;observer.disconnect();};
  },[limit,total]);
  return <div className="feed-load-more"><div className="feed-sentinel" ref={sentinel} aria-hidden="true"/><button className="secondary" onClick={onMore}>Показать ещё</button></div>;
}

function Card({ e, featured = false, onSelect }) {
    const annotation = e.annotation;
    const complexity = annotation?.complexity?.overall;
    return (
      <button
        className={`event-card ${featured ? "featured" : ""}`}
        style={complexityCardStyle(complexity)}
        onClick={() => onSelect(e)}
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
        </div>
        <div className="event-body">
          <h3>{e.short}</h3>
          <p>{annotation?.shortExplanation || e.intro}</p>
          {e.recommendationReasons?.length>0 && <p className="recommendation-reasons">{e.recommendationReasons.join(' · ')}</p>}
          {annotation && (Number.isFinite(complexity) || annotation.firstTime?.verdict === "suitable" || annotation.quality?.status === "clarification_required") && <div className="event-insights">
            {annotation.firstTime?.verdict === "suitable" && <span className="insight-chip beginner"><Sprout size={12}/>Для первого раза · {annotation.firstTime.score}</span>}
            {Number.isFinite(complexity) && <span className="insight-chip difficulty">{complexityText(complexity)}</span>}
            {annotation.quality?.status === "clarification_required" && <span className="insight-chip clarify">Есть что уточнить</span>}
          </div>}
          <div className="event-meta">
            <span>
              <MapPin size={14} />
              {Number.isFinite(e.distanceKm) ? `${e.distanceKm.toLocaleString('ru-RU')} км по прямой` : e.city}
            </span>
            <span>{annotation ? commitmentLabels[annotation.participation?.commitment] : "Дату уточняем"}</span>
          </div>
        </div>
      </button>
    );
  }
function CatalogFeed({recommendations,chosen,audienceFilter,difficultyFilter,dateFrom,dateTo,timeFilter,formatFilter,feedQuery,feedFiltersOpen,feedLimit,eventMatchesActiveFilters,setFeedQuery,setFeedLimit,setFeedFiltersOpen,setDifficultyFilter,setDateFrom,setDateTo,setTimeFilter,setFormatFilter,setAudienceFilter,cityCatalogById,onSelect,onLocate}) {
    const sections = recommendations.sections || [{ id: "all", title: "Для тебя", subtitle: "Актуальные дела", eventIds: chosen.slice(0, 6).map((event) => event.id) }];
    const activeFilterCount = [audienceFilter, difficultyFilter, dateFrom || dateTo, timeFilter, formatFilter, feedQuery.trim()].filter(Boolean).length;
    const filteredEvents = chosen.filter(eventMatchesActiveFilters);
    const recommendedIds = new Set(activeFilterCount ? [] : sections.flatMap((section) => section.eventIds));
    const moreEvents = activeFilterCount ? filteredEvents : chosen.filter((event) => !recommendedIds.has(event.id));
    const visibleEvents = moreEvents.slice(0, feedLimit);
    return <section className="daily-feed">
      <section className="feed-filtering" aria-label="Фильтры добрых дел">
        <div className="feed-search-row">
          <label className="feed-search"><Search size={17}/><input value={feedQuery} onChange={(event) => { setFeedQuery(event.target.value); setFeedLimit(12); }} placeholder="Найти дело" aria-label="Поиск по добрым делам"/></label>
          <button className={`filter-toggle ${feedFiltersOpen ? "active" : ""}`} onClick={() => setFeedFiltersOpen((value) => !value)} aria-expanded={feedFiltersOpen}><SlidersHorizontal size={17}/>Фильтры{activeFilterCount > 0 && <i>{activeFilterCount}</i>}</button>
        </div>
        <div className={`advanced-filters ${feedFiltersOpen ? "open" : ""}`}>
          <div className="filter-groups">
            <div className="filter-group"><span>Сложность</span><div className="filter-options">{[["easy", "Легко"], ["medium", "Средне"], ["hard", "Сложно"]].map(([id, label]) => <button key={id} className={difficultyFilter === id ? "active" : ""} aria-pressed={difficultyFilter === id} onClick={() => { setDifficultyFilter((current) => current === id ? "" : id); setFeedLimit(12); }}>{label}</button>)}</div></div>
            <div className="filter-group filter-date"><span>Даты</span><DateRangePicker from={dateFrom} to={dateTo} onApply={(from, to) => { setDateFrom(from); setDateTo(to); setFeedLimit(12); }}/></div>
            <div className="filter-group"><span>Время</span><div className="filter-options">{[["morning", "Утро"], ["day", "День"], ["evening", "Вечер"]].map(([id, label]) => <button key={id} className={timeFilter === id ? "active" : ""} aria-pressed={timeFilter === id} onClick={() => { setTimeFilter((current) => current === id ? "" : id); setFeedLimit(12); }}>{label}</button>)}</div></div>
            <div className="filter-group"><span>Формат</span><div className="filter-options">{[["on_site", "На месте"], ["online", "Онлайн"]].map(([id, label]) => <button key={id} className={formatFilter === id ? "active" : ""} aria-pressed={formatFilter === id} onClick={() => { setFormatFilter((current) => current === id ? "" : id); setFeedLimit(12); }}>{label}</button>)}</div></div>
            <div className="filter-group filter-audience"><span>Кому помочь</span><div className="filter-options">{audienceFilters.map(([id, label]) => <button key={id} className={audienceFilter === id ? "active" : ""} aria-pressed={audienceFilter === id} onClick={() => { setAudienceFilter((current) => current === id ? "" : id); setFeedLimit(12); }}>{label}</button>)}</div></div>
          </div>
          {activeFilterCount > 0 && <button className="reset-filters" onClick={() => { setDifficultyFilter(""); setDateFrom(""); setDateTo(""); setTimeFilter(""); setFormatFilter(""); setAudienceFilter(""); setFeedQuery(""); setFeedLimit(12); }}>Сбросить всё <X size={14}/></button>}
        </div>
        {activeFilterCount > 0 && <div className="filter-result"><strong>{filteredEvents.length}</strong><span>{filteredEvents.length === 1 ? "подходящее дело" : "подходящих дел"}</span></div>}
      </section>
      {!activeFilterCount && <div className="feed-sections">
        {sections.map((section) => {
          const items = section.eventIds.map((id) => cityCatalogById.get(id)).filter(Boolean);
          if (section.hidden) return null;
          if (!items.length && section.id !== "nearby") return null;
          return <section className="feed-block" key={section.id}>
            <div className="section-head"><h2>{section.id === "daily" ? "Для тебя" : section.title}{section.id === "taste" ? " 🌱" : ""}</h2></div>
            {section.id === "nearby" && !items.length && <div className="feed-empty"><p>{section.locationRequired ? section.subtitle : "В пределах 10 км пока нет подходящих дел."}</p>{section.locationRequired && <button className="secondary" onClick={onLocate}>Поделиться геопозицией</button>}</div>}
            <div className="feed-rail">{items.map((event) => <Card key={event.id} e={event} onSelect={onSelect}/>)}</div>
          </section>;
        })}
      </div>}
      {moreEvents.length > 0 && <section className="infinite-events">
        <div className="cards catalog">{visibleEvents.map((event) => <Card key={event.id} e={event} onSelect={onSelect}/>)}</div>
        {visibleEvents.length < moreEvents.length && <FeedLoadMore limit={feedLimit} total={moreEvents.length} onMore={() => setFeedLimit(limit=>Math.min(limit+12,moreEvents.length))}/>}
      </section>}
      {activeFilterCount > 0 && !moreEvents.length && <div className="feed-empty"><Sprout size={34}/><h2>Таких дел пока не нашли</h2><p>Убери один из фильтров — покажем ближайшие варианты.</p><button className="secondary" onClick={() => { setDifficultyFilter(""); setDateFrom(""); setDateTo(""); setTimeFilter(""); setFormatFilter(""); setAudienceFilter(""); setFeedQuery(""); }}>Сбросить фильтры</button></div>}
    </section>;
  }
function AgePrompt({ value, onChange, onSave, onLater, busy, error }) {
  const dialog = useRef(null);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const age = Number(value);
  const valid = Number.isInteger(age) && age >= 7 && age <= 100;
  return <dialog ref={dialog} className="age-prompt" aria-labelledby="age-prompt-title" onCancel={event => { event.preventDefault(); if (!busy) onLater(); }}>
    <form onSubmit={event => { event.preventDefault(); if (valid && !busy) onSave(age); }}>
      <h2 id="age-prompt-title">Сколько тебе лет?</h2>
      <p>Возраст нужен, чтобы показывать дела, подходящие тебе по возрасту.</p>
      <label htmlFor="feed-age">Возраст</label>
      <input id="feed-age" type="number" inputMode="numeric" min="7" max="100" step="1" autoFocus value={value} onChange={event => onChange(event.target.value)} placeholder="Например, 23" required />
      {error && <p className="age-prompt-error" role="alert">{error}</p>}
      <button className="primary" disabled={busy || !valid}>{busy ? 'Сохраняем…' : 'Сохранить'}</button>
      <button type="button" className="text-button" disabled={busy} onClick={onLater}>Позже</button>
    </form>
  </dialog>;
}
function App() {
  const [data, setData] = useState(null),
    [fatal, setFatal] = useState(""),
    [tab, setTab] = useState(() => initialTab({ search: location.search, payload: startPayload })),
    [detail, setDetail] = useState(null),
    [onboard, setOnboard] = useState(false),
    [profile, setProfile] = useState({ category: "all", barrier: "company" }),
    [interestSelection, setInterestSelection] = useState([]),
    [toast, setToastMessage] = useState(""),
    [toastError, setToastError] = useState(false),
    [busy, setBusy] = useState(false),
    [swipeAnimating, setSwipeAnimating] = useState(false),
    [invite, setInvite] = useState(null),
    [inviteCode, setInviteCode] = useState(() =>
      new URLSearchParams(location.search).get("invite") ||
      (startPayload.startsWith("i_") ? startPayload.slice(2) : "")),
    [settings, setSettings] = useState(false),
    [feedLimit, setFeedLimit] = useState(12),
    [audienceFilter, setAudienceFilter] = useState(""),
    [difficultyFilter, setDifficultyFilter] = useState(""),
    [dateFrom, setDateFrom] = useState(""),
    [dateTo, setDateTo] = useState(""),
    [timeFilter, setTimeFilter] = useState(""),
    [formatFilter, setFormatFilter] = useState(""),
    [feedQuery, setFeedQuery] = useState(""),
    [selectedPlanId, setSelectedPlanId] = useState(null),
    [feedFiltersOpen, setFeedFiltersOpen] = useState(false),
    [registrationName, setRegistrationName] = useState(""),
    [registrationAge, setRegistrationAge] = useState(""),
    [ageDismissed, setAgeDismissed] = useState(false),
    [ageError, setAgeError] = useState(''),
    [selectedCity, setSelectedCity] = useState(() => {
      const saved = localStorage.getItem("helpi-city");
      return cityNames.has(saved) ? saved : "Москва";
    }),
    [systemTheme, setSystemTheme] = useState(() => window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light");
  const theme = systemTheme;
  const swipeGesture = useRef(null);
  const swipeCard = useRef(null);
  const swipeAnimationLock = useRef(false);
  const swipeQueue = useRef([]);
  const swipeSaving = useRef(false);
  const swipeAcknowledged = useRef(null);
  const pendingInviteShare = useRef(null);
  useEffect(() => {
    const recommendations = data?.recommendations;
    if (recommendations?.stage !== 'calibration') return;
    const next = recommendations.items?.slice(recommendations.completed + 1, recommendations.completed + 3) || [];
    for (const item of next) {
      const event = data.catalog.find(candidate => candidate.id === item.id);
      const imageUrl = interestArtwork[event?.theme] || event?.image;
      if (imageUrl) { const image = new Image(); image.src = imageUrl; image.decode?.().catch(() => {}); }
    }
  }, [data?.recommendations?.completed, data?.recommendations?.stage, data?.catalog]);
  const cityPickerRef = useRef(null);
  async function load(city = selectedCity, allowOnboarding = false) {
    try {
      const d = await api("/bootstrap?city="+encodeURIComponent(city));
      setData(d);
      setProfile(d.user.profile);
      setInterestSelection(d.user.profile.interests || []);
      setOnboard(d.recommendations?.stage === "interests" && ((!inviteCode && !initialEventId) || allowOnboarding));
      setRegistrationName(d.user.name === "Друг" ? d.maxProfile?.firstName || "" : d.user.name || "");
      setRegistrationAge(d.user.profile?.age ? String(d.user.profile.age) : "");
      setFatal("");
    } catch (e) {
      setFatal(e.message);
    }
  }
  useEffect(() => {
    maxApp?.ready?.();
    maxApp?.expand?.();
    load();
    if (initialEventId)
      api("/events/" + encodeURIComponent(initialEventId))
        .then(event => {
          setDetail(event);
          setTab("home");
          setOnboard(false);
        })
        .catch(error => {
          setToast(error.message, true);
          load(selectedCity, true);
        });
    if (inviteCode)
      api("/invites/" + inviteCode)
        .then((result) => {
          if (!result.event) throw new Error("Дело из приглашения больше недоступно.");
          setInvite(result);
          setDetail(result.event);
          setTab("home");
          setOnboard(false);
        })
        .catch((e) => {
          clearInvite();
          setToast(e.message, true);
          load(selectedCity, true);
        });
  }, []);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);
  useEffect(() => {
    // MAX UI reads this media query inside the mini-app; follow its live changes too.
    const query = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!query) return;
    const update = (event) => setSystemTheme(event.matches ? "dark" : "light");
    setSystemTheme(query.matches ? "dark" : "light");
    if (query.addEventListener) {
      query.addEventListener("change", update);
      return () => query.removeEventListener("change", update);
    }
    query.addListener(update);
    return () => query.removeListener(update);
  }, []);
  useEffect(() => {
    localStorage.setItem("helpi-city", selectedCity);
  }, [selectedCity]);
  useEffect(() => {
    const closeCityPicker = (event) => {
      if (!cityPickerRef.current?.contains(event.target)) cityPickerRef.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", closeCityPicker);
    return () => document.removeEventListener("pointerdown", closeCityPicker);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    const back = () => {
      if (selectedPlanId && !detail) { setSelectedPlanId(null); return; }
      if (["garden", "map"].includes(tab) && !detail && !onboard && !settings) {
        go("home");
        return;
      }
      closeDetail();
      if (data?.user?.interestOnboarded) setOnboard(false);
      setSettings(false);
    };
    if (detail || selectedPlanId || onboard || settings || ["garden", "map"].includes(tab)) {
      maxApp?.BackButton?.show?.();
      maxApp?.BackButton?.onClick?.(back);
    } else maxApp?.BackButton?.hide?.();
    return () => maxApp?.BackButton?.offClick?.(back);
  }, [tab, detail, selectedPlanId, onboard, settings, data?.user?.interestOnboarded]);
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [tab, detail, selectedPlanId, onboard, settings]);
  useEffect(() => {
    if (data?.recommendations?.stage === "feed") window.scrollTo({ top: 0, behavior: "smooth" });
  }, [data?.recommendations?.stage, audienceFilter, difficultyFilter, dateFrom, dateTo, timeFilter, formatFilter, feedQuery]);
  useEffect(()=>{setFeedLimit(12);},[selectedCity,audienceFilter,difficultyFilter,dateFrom,dateTo,timeFilter,formatFilter,feedQuery]);
  function openDetail(event) {
    setDetail(event);
    if(event?.id && data?.user?.registered) api('/recommendations/signals','POST',{eventId:event.id,selectedVacancyId:event.selectedVacancyId,action:'open_detail',city:selectedCity}).catch(()=>{});
  }
  function clearInvite() {
    setInvite(null);
    setInviteCode("");
    if (new URLSearchParams(location.search).has("invite") || new URLSearchParams(location.search).has("startapp"))
      history.replaceState(null, "", location.pathname);
  }
  function closeDetail() {
    setDetail(null);
    if (initialEventId) {
      history.replaceState(null, "", location.pathname);
      if (data?.recommendations?.stage === "interests") setOnboard(true);
    }
    if (invite) {
      clearInvite();
      if (data?.recommendations?.stage === "interests") setOnboard(true);
    }
  }
  function setToast(message, isError = false) {
    setToastError(isError);
    setToastMessage(message);
  }
  async function act(fn) {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setToast(e.message, true);
    } finally {
      setBusy(false);
    }
  }
  async function shareLocationFromFeed() {
    await act(async () => {
      if (maxInitData() && data.botUsername) {
        const result = await api('/location/request', 'POST', {});
        const link = `https://max.ru/${result.botUsername.replace(/^@/, '')}`;
        if (maxApp?.openMaxLink) maxApp.openMaxLink(link);
        else if (maxApp?.openLink) maxApp.openLink(link);
        else window.location.assign(link);
        setToast('Поделись геопозицией в чате бота и вернись в приложение.');
      } else {
        if (!navigator.geolocation) throw new Error('В этом браузере геопозиция недоступна.');
        const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, () => reject(new Error('Разреши доступ к геопозиции в настройках браузера.')), { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }));
        await api('/location', 'POST', { lat: position.coords.latitude, lng: position.coords.longitude });
        await load();
      }
    });
  }
  useEffect(() => {
    const refreshLocation = () => {
      if (document.visibilityState !== 'visible' || !data?.user?.registered || swipeSaving.current || swipeQueue.current.length) return;
      api('/location').then(result => {
        if (result.location?.at !== data.location?.at) load();
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', refreshLocation);
    window.addEventListener('focus', refreshLocation);
    return () => { document.removeEventListener('visibilitychange', refreshLocation); window.removeEventListener('focus', refreshLocation); };
  }, [data?.user?.registered, data?.location?.at, selectedCity]);
  function go(t) {
    const nextTab = t === "discover" || t === "together" ? "home" : ["plan", "garden"].includes(t) ? "profile" : t;
    setTab(nextTab);
    setDetail(null);
    setSelectedPlanId(null);
    if (invite) clearInvite();
    setOnboard(false);
    setSettings(false);
    if(nextTab === 'home' && data?.user?.registered) load(selectedCity, true);
  }
  async function save(patch) {
    await api("/profile", "PATCH", patch);
    await load();
  }
  async function sharePlanInMax(planId, eventId = null) {
    if (!maxInitData() || typeof maxApp?.shareMaxContent !== 'function')
      throw new Error('Приглашение с картинкой можно отправить из мини-приложения в MAX.');
    let prepared = pendingInviteShare.current;
    if (prepared?.planId !== planId) {
      const { mid, chatType } = await api(`/plans/${planId}/invite`, "POST", { shareInMax: true });
      prepared = { planId, eventId, mid, chatType };
      pendingInviteShare.current = prepared;
    }
    try {
      await maxApp.shareMaxContent({ mid: prepared.mid, chatType: prepared.chatType });
    } catch {
      throw new Error('MAX не открыл выбор чата. Нажми «Позвать друга» ещё раз.');
    }
    pendingInviteShare.current = null;
  }
  async function inviteFromEvent(e) {
    await act(async () => {
      if (!maxInitData() || typeof maxApp?.shareMaxContent !== 'function')
        throw new Error('Приглашение с картинкой можно отправить из мини-приложения в MAX.');
      if (pendingInviteShare.current?.eventId === e.id) {
        await sharePlanInMax(pendingInviteShare.current.planId, e.id);
        return;
      }
      const p = await api("/plans", "POST", {
        eventId: e.id,
        mode: "friend",
      });
      await sharePlanInMax(p.id, e.id);
      await load();
    });
  }
  async function update(id, patch) {
    await act(async () => {
      await api("/plans/" + id, "PATCH", patch);
      await load();
      if(patch.status === 'done') {
        go('profile');
        setToast('Новое растение в твоём саду · +100 воды' + (patch.hours ? ` · +${patch.hours * 50} солнца` : ''));
      } else {
        if (patch.status === 'cancelled') setSelectedPlanId(null);
        setToast("План обновлён");
      }
    });
  }
  async function inviteFriend(p) {
    await act(async () => {
      await sharePlanInMax(p.id);
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
  const registrationAgeNumber = Number(registrationAge);
  const registrationValid = registrationName.trim().length >= 2
    && registrationName.trim().length <= 60
    && Number.isInteger(registrationAgeNumber)
    && registrationAgeNumber >= 7
    && registrationAgeNumber <= 100;
  const active = data.plans.filter(
    (p) => !["cancelled", "done"].includes(p.status),
  );
  const done = data.plans.filter((p) => p.status === "done");
  const liveCatalog = data.catalog.filter(live);
  const chosen = liveCatalog.filter((event) => eventMatchesCity(event, selectedCity));
  const mapEvents = liveCatalog.filter((event) => eventMatchesCity(event, selectedCity, false));
  const catalogById = new Map(data.catalog.map((event) => [event.id, event]));
  const cityCatalogById = new Map(chosen.map((event) => [event.id, event]));
  const selectedCityOption = cityOptions.find((city) => city.name === selectedCity) || cityOptions[0];
  const recommendations = data.recommendations || { stage: "interests" };
  const calibrationItem = recommendations.stage === "calibration"
    ? recommendations.items?.[recommendations.completed]
    : null;
  const swipeEvent = catalogById.get(calibrationItem?.id);
  async function drainSwipeQueue() {
    if (swipeSaving.current) return;
    swipeSaving.current = true;
    try {
      while (swipeQueue.current[0]?.ready) {
        const job = swipeQueue.current[0];
        const result = await api('/recommendations/feedback', 'POST', job.payload);
        swipeQueue.current.shift();
        swipeAcknowledged.current = result;
        // Earlier acknowledgements must not rewind optimistic cards.
        if (!swipeQueue.current.length) {
          setData(current => ({ ...current, user: result.user, recommendations: result.recommendations,
            ...(result.catalog ? { catalog: result.catalog } : {}) }));
          setProfile(result.user.profile);
        }
      }
    } catch {
      swipeQueue.current = [];
      swipeAnimationLock.current = true;
      setSwipeAnimating(true);
      const acknowledged = swipeAcknowledged.current;
      if (acknowledged) setData(current => ({ ...current, ...acknowledged }));
      setToast('Не удалось сохранить выбор. Проверь соединение и попробуй снова.', true);
      try {
        const fresh = await api('/bootstrap?city=' + encodeURIComponent(selectedCity));
        swipeAcknowledged.current = { user: fresh.user, recommendations: fresh.recommendations };
        setData(fresh);
        setProfile(fresh.user.profile);
      } catch { /* Retry remains possible from the last acknowledged card. */ }
      swipeAnimationLock.current = false;
      setSwipeAnimating(false);
    } finally { swipeSaving.current = false; }
  }
  async function sendFeedback(action) {
    if (!swipeEvent || busy || swipeAnimationLock.current) return;
    swipeAnimationLock.current = true;
    setSwipeAnimating(true);
    swipeAcknowledged.current ||= { user: data.user, recommendations: data.recommendations };
    const job = { ready: false, payload: { eventId: swipeEvent.id, action, context: 'calibration', city: selectedCity } };
    swipeQueue.current.push(job);
    const card = swipeCard.current;
    if (card) {
      const direction = action === "like" ? 1 : -1;
      card.style.transition = "transform .16s ease-out";
      card.style.transform = `translate3d(${direction * (window.innerWidth + card.clientWidth)}px,0,0) rotate(${direction * 14}deg)`;
    }
    await new Promise(resolve => setTimeout(resolve, 160));
    if (!swipeQueue.current.includes(job)) return;
    job.ready = true;
    setData(current => ({ ...current, recommendations: { ...current.recommendations, completed: current.recommendations.completed + 1 } }));
    swipeAnimationLock.current = false;
    setSwipeAnimating(false);
    void drainSwipeQueue();
  }
  const nav = [
    ["home", Compass, "Добрые дела"],
    ["map", MapIcon, "Карта"],
    ["profile", UserRound, "Профиль"],
  ];
  const mobileNav = nav;
  function CityPicker() {
    async function chooseCity(name) {
      cityPickerRef.current?.removeAttribute("open");
      if (name === selectedCity) return;
      setSelectedCity(name);
      setFeedLimit(12);
      setDetail(null);
      await act(async () => {
        const user = await api("/profile", "PATCH", { city: name });
        setData((current) => ({ ...current, user }));
        setProfile(user.profile);
        await load(name);
      });
    }
    return <details className="city-picker" ref={cityPickerRef}>
      <summary aria-label={`Город: ${selectedCity}. Изменить город`}>
        <MapPin size={15}/><span>{selectedCity}</span><ChevronDown size={14}/>
      </summary>
      <div className="city-menu" role="menu" aria-label="Выбор города">
        {cityOptions.map((city) => <button type="button" role="menuitemradio" aria-checked={city.name === selectedCity} className={city.name === selectedCity ? "active" : ""} key={city.name} onClick={() => chooseCity(city.name)}>
          <span>{city.name}</span>{city.name === selectedCity && <Check size={15}/>}
        </button>)}
      </div>
    </details>;
  }
  function BottomNav({ garden = false }) {
    return <nav className={garden ? "garden-nav" : "mobile-nav"} aria-label="Основная навигация">
      {mobileNav.map(([id, Icon, label]) => <button aria-label={id === "home" ? "Дела" : label} className={`${tab === id ? "active " : ""}nav-${id}`} key={id} onClick={() => go(id)}>
        <Icon size={21} />
        <span>{id === "home" ? "Дела" : label}</span>
        {id === "profile" && active.length > 0 && <i>{active.length}</i>}
      </button>)}
    </nav>;
  }
  function matchesAudience(event, audience) {
    if (!audience) return true;
    const annotation = event.annotation;
    if (annotation?.beneficiaryGroups?.includes(audience)) return true;
    if (annotation?.causeAreas?.includes(audience)) return true;
    return audience === "animals" && event.themes?.includes("animals")
      || audience === "environment" && event.themes?.some((theme) => ["ecology", "nature", "recycling"].includes(theme));
  }
  function matchesDifficulty(event, difficulty) {
    if (!difficulty) return true;
    const score = event.annotation?.complexity?.overall;
    if (!Number.isFinite(score)) return false;
    if (difficulty === "easy") return score < 40;
    if (difficulty === "medium") return score >= 40 && score < 70;
    return score >= 70;
  }
  function matchesDate(event, from, to) {
    if (!from && !to) return true;
    const eventStart = Date.parse(event.startsAt);
    const eventEnd = Date.parse(event.endsAt) || eventStart;
    if (!Number.isFinite(eventStart)) return false;
    const fromStart = from ? Date.parse(`${from}T00:00:00+03:00`) : -Infinity;
    const toEnd = to ? Date.parse(`${to}T00:00:00+03:00`) + 86_400_000 - 1 : Infinity;
    return eventStart <= toEnd && eventEnd >= fromStart;
  }
  function matchesTime(event, period) {
    if (!period) return true;
    const parsed = new Date(event.startsAt);
    if (Number.isNaN(parsed.getTime())) return false;
    const moscowHour = (parsed.getUTCHours() + 3) % 24;
    if (period === "morning") return moscowHour >= 6 && moscowHour < 12;
    if (period === "day") return moscowHour >= 12 && moscowHour < 18;
    return moscowHour >= 18 || moscowHour < 6;
  }
  function matchesFormat(event, format) {
    if (!format) return true;
    const eventFormat = event.annotation?.format || event.traits?.format;
    return format === "online"
      ? eventFormat === "online"
      : ["on_site", "offline", "field_trip", "hybrid"].includes(eventFormat);
  }
  function eventMatchesActiveFilters(event) {
    const query = feedQuery.trim().toLocaleLowerCase("ru-RU");
    const searchable = `${event.title} ${event.short} ${event.intro} ${event.annotation?.shortExplanation ?? ""} ${(event.annotation?.structuredTasks ?? []).join(" ")}`.toLocaleLowerCase("ru-RU");
    return (!query || searchable.includes(query))
      && matchesAudience(event, audienceFilter)
      && matchesDifficulty(event, difficultyFilter)
      && matchesDate(event, dateFrom, dateTo)
      && matchesTime(event, timeFilter)
      && matchesFormat(event, formatFilter);
  }
  // A render helper keeps the moving DOM node stable across App state changes.
  function renderSwipeExperience() {
    if (!swipeEvent && recommendations.completed >= recommendations.target)
      return <section className="swipe-saving" role="status"><Sprout size={36}/><p>Сохраняем твой выбор…</p></section>;
    if (!swipeEvent) return <CatalogFeed recommendations={recommendations} chosen={chosen} audienceFilter={audienceFilter} difficultyFilter={difficultyFilter} dateFrom={dateFrom} dateTo={dateTo} timeFilter={timeFilter} formatFilter={formatFilter} feedQuery={feedQuery} feedFiltersOpen={feedFiltersOpen} feedLimit={feedLimit} eventMatchesActiveFilters={eventMatchesActiveFilters} setFeedQuery={setFeedQuery} setFeedLimit={setFeedLimit} setFeedFiltersOpen={setFeedFiltersOpen} setDifficultyFilter={setDifficultyFilter} setDateFrom={setDateFrom} setDateTo={setDateTo} setTimeFilter={setTimeFilter} setFormatFilter={setFormatFilter} setAudienceFilter={setAudienceFilter} cityCatalogById={cityCatalogById} onSelect={openDetail} onLocate={shareLocationFromFeed} />;
    const completed = recommendations.completed;
    const target = recommendations.target;
    return <section className="swipe-home calibration-swipe">
      <div className="swipe-intro">
        <div><h1>Что тебе хотелось бы попробовать?</h1></div>
        <span className="swipe-count">{completed + 1} / {target}</span>
      </div>
      <div className="swipe-deck" onDragStart={(event) => event.preventDefault()} onPointerDown={(event) => {
        if (busy || swipeAnimationLock.current || (event.pointerType === "mouse" && event.button !== 0)) return;
        swipeGesture.current = { id: event.pointerId, startX: event.clientX, distance: 0 };
        event.currentTarget.setPointerCapture(event.pointerId);
        if (swipeCard.current) swipeCard.current.style.transition = "none";
      }} onPointerMove={(event) => {
        const gesture = swipeGesture.current;
        if (!gesture || gesture.id !== event.pointerId || !swipeCard.current) return;
        gesture.distance = event.clientX - gesture.startX;
        swipeCard.current.style.transform = `translate3d(${gesture.distance}px,0,0) rotate(${gesture.distance / 28}deg)`;
      }} onPointerUp={(event) => {
        const gesture = swipeGesture.current;
        if (!gesture || gesture.id !== event.pointerId) return;
        swipeGesture.current = null;
        if (Math.abs(gesture.distance) >= 32) sendFeedback(gesture.distance > 0 ? "like" : "skip");
        else if (swipeCard.current) {
          swipeCard.current.style.transition = "transform .18s ease-out";
          swipeCard.current.style.transform = "";
        }
      }} onPointerCancel={() => {
        swipeGesture.current = null;
        if (swipeAnimationLock.current) return;
        if (swipeCard.current) {
          swipeCard.current.style.transition = "transform .18s ease-out";
          swipeCard.current.style.transform = "";
        }
      }}>
        <div className="swipe-home-card" key={swipeEvent.id} ref={swipeCard}>
          <div className="swipe-home-media">{(interestArtwork[swipeEvent.theme] || swipeEvent.image) ? <img src={interestArtwork[swipeEvent.theme] || swipeEvent.image} alt="" draggable={false}/> : <Plant/>}<span className="swipe-home-label">{themeMeta[swipeEvent.theme]?.[0]} {themeTitle(swipeEvent)}</span></div>
          <div className="swipe-home-copy"><h2>{swipeEvent.short}</h2><div className="trait-row"><span>{swipeEvent.annotation?.format === "online" || (!swipeEvent.annotation && swipeEvent.traits?.format === "online") ? "Онлайн" : "На месте"}</span><span>{swipeEvent.annotation?.feedSignals?.friendsAllowed === "yes" ? "Можно вместе" : swipeEvent.annotation?.participation?.modes?.includes("solo") ? "Можно одному" : "Формат уточнить"}</span><span>{swipeEvent.annotation ? complexityText(swipeEvent.annotation.complexity.overall) : swipeEvent.traits?.duration === "short" ? "Около часа" : swipeEvent.traits?.duration === "long" ? "Регулярно" : "1–3 часа"}</span></div><button type="button" className="text-button" onPointerDown={(event) => event.stopPropagation()} onPointerUp={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); openDetail(swipeEvent); }}>Подробнее <ArrowUpRight size={18}/></button></div>
        </div>
      </div>
      <div className="swipe-home-actions"><button className="swipe-round skip" disabled={busy || swipeAnimating} onClick={() => sendFeedback("skip")} aria-label="Не моё"><X size={33}/></button><button className="swipe-round like" disabled={busy || swipeAnimating} onClick={() => sendFeedback("like")} aria-label="Мне подходит"><Heart size={33}/></button></div>
    </section>;
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
            {p.demo ? "ТЕСТОВОЕ ДЕЛО · САМООТЧЁТ" : owner ? "ТВОЙ ПЛАН" : "ВЫ ИДЁТЕ ВМЕСТЕ"}
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
                    if (pendingInviteShare.current?.planId === p.id) pendingInviteShare.current = null;
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
                        disabled={busy}
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
  if (settings)
    content = (
      <>
        <button className="back" onClick={() => setSettings(false)}>
          <ArrowLeft size={17} />
          Назад
        </button>
        <h1 className="settings-title">Настройки</h1>
        <div className="settings-panel">
          <div className="settings-city-row">
            <div className="settings-city-copy">
              <h3>Город</h3>
            </div>
            <CityPicker />
          </div>
          <hr />
          <h3>Ежедневная подборка</h3>
          <p>
            Рекомендованные дела приходят утром в MAX. Можно отключить здесь или командой /stop в боте.
          </p>
          <label className="checkbox-label">
            <input
              type="checkbox"
              disabled={data.mode === "demo" || busy}
              checked={data.user.dailyDigest === true || (data.user.dailyDigest !== false && data.user.reminders !== false)}
              onChange={(e) =>
                act(() => save({ dailyDigest: e.target.checked }))
              }
            />
            Присылать рекомендации в MAX
          </label>
          <hr />
          <h3>Твои данные</h3>
          <form className="personal-form" onSubmit={(event) => event.preventDefault()} onBlur={(event) => {
            if (event.currentTarget.contains(event.relatedTarget)) return;
            if (registrationName.trim() === data.user.name && registrationAgeNumber === Number(profile.age)) return;
            if (!registrationValid) {
              setToast("Укажи имя от 2 до 60 символов и возраст от 7 до 100 лет.", true);
              return;
            }
            act(async () => {
              await save({ registration: { name: registrationName, age: registrationAgeNumber } });
              setToast("Имя и возраст обновлены");
            });
          }}>
            <label>Имя<input autoComplete="name" maxLength={60} value={registrationName} onChange={(event) => setRegistrationName(event.target.value)} required /></label>
            <label>Возраст<input type="number" inputMode="numeric" min="7" max="100" step="1" value={registrationAge} onChange={(event) => setRegistrationAge(event.target.value)} required /></label>
          </form>
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
          <div className="interest-copy"><h1 id="interest-title">Что тебе близко?</h1><p>Выбери темы, которые тебе интересны.</p></div>
          <div className="interest-grid">
            {interestOptions.map(([id, emoji, title, description]) => {
              const selected = interestSelection.includes(id);
              const source = interestArtwork[id];
              return <button key={id} className={`interest-card ${selected ? "selected" : ""}`} aria-pressed={selected} onClick={() => setInterestSelection((current) => selected ? current.filter((item) => item !== id) : [...current, id])}>
                <span className={`interest-image${source ? "" : " illustrated"}`} style={{ backgroundImage: source ? `url(${source})` : undefined }}><span className="interest-tint" />{!source && <span className="interest-fallback" aria-hidden="true">{emoji}</span>}<span className="interest-emoji">{emoji}</span>{selected && <span className="interest-check"><Check size={14} strokeWidth={3} /></span>}</span>
                <span className="interest-title">{title}</span><span className="interest-description">{description}</span>
              </button>;
            })}
          </div>
          <div className="interest-actions"><span>Выбрано: {interestSelection.length}</span><button className="primary" disabled={busy} onClick={() => act(async () => { await api("/profile", "PATCH", { interests: interestSelection }); await load(); setFeedLimit(12); setOnboard(false); go("home"); })}>Настроить ленту <ArrowRight size={18} /></button></div>
        </section>
      </div>
    );
  else if (selectedPlanId && !detail && data.plans.some(plan => plan.id === selectedPlanId))
    content = <><button className="back" onClick={() => setSelectedPlanId(null)}><ArrowLeft size={17}/>К саду</button><PlanItem key={selectedPlanId} p={data.plans.find(plan => plan.id === selectedPlanId)}/></>;
  else if (detail)
    content = (
      <>
        <button className="back" onClick={closeDetail}>
          <ArrowLeft size={17} />{tab === "map" ? "К карте" : "К добрым делам"}
        </button>
        <article className="detail">
          <div className="detail-image">
            {detail.image && <img src={detail.image} alt={detail.short} />}
            <span className="photo-tag">{themeTitle(detail)}</span>
          </div>
          <div className="detail-main">
            <span className="eyebrow">{detail.city} · {detail.demo ? "ТЕСТОВОЕ ДЕЛО" : "ДОБРО"}</span>
            <h1>{detail.short}</h1>
            {invite && <div className="detail-invite-intro"><span className="eyebrow">ПРИГЛАШЕНИЕ</span><p><strong>{invite.ownerName}</strong> зовёт тебя на это дело{invite.when ? ` · ${dateLabel(invite.when)}` : ""}</p></div>}
            <p className="lead">{detail.intro}</p>
            <dl className="facts">
              <div>
                <dt>Адрес</dt>
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
                <dt>Длительность</dt>
                <dd>{detail.annotation?.facts?.exactDurationMinutes ? `${detail.annotation.facts.exactDurationMinutes} мин.` : "Не указана"}</dd>
              </div>
              <div>
                <dt>Возраст</dt>
                <dd>{detail.annotation?.facts?.minimumAge ? `${detail.annotation.facts.minimumAge}+` : "Не указан"}</dd>
              </div>
            </dl>
            <div className="detail-action">
              {invite && !invite.joined && <p className="detail-invite-privacy">После принятия приглашения другу будет видно твоё имя в MAX.</p>}
              <div className="detail-action-buttons">
                {invite && <button className="primary" disabled={busy} onClick={() => act(async () => {
                  if (!invite.joined) {
                    await api("/invites/" + inviteCode, "POST", {});
                    await load();
                  }
                  clearInvite();
                  go("profile");
                })}>{invite.joined ? "Открыть общий план" : "Пойду вместе"}<ArrowRight size={18}/></button>}
                {live(detail) ? <a className={invite ? "secondary" : "primary"} href={detail.demo ? "https://dobro.ru/" : `https://dobro.ru/event/${encodeURIComponent(detail.id)}${detail.selectedVacancyId ? `/vacancy/${encodeURIComponent(detail.selectedVacancyId)}` : ""}`} target="_blank" rel="noopener noreferrer">Записаться на дело <ExternalLink size={18}/></a>
                  : <span className="primary detail-action-unavailable">Событие завершилось</span>}
                {!invite && <button
                  className="secondary"
                  disabled={busy || !live(detail)}
                  onClick={() => act(async () => {
                    const plan = await api("/plans", "POST", { eventId: detail.id, selectedVacancyId: detail.selectedVacancyId, mode: "solo" });
                    await load();
                    go("profile");
                    setSelectedPlanId(plan.id);
                  })}
                >Сохранить дело</button>}
                {!invite && <button
                  className="secondary"
                  disabled={busy || !live(detail)}
                  onClick={() => inviteFromEvent(detail)}
                >
                  <Users size={17}/>
                  Позвать друга
                </button>}
              </div>
            </div>
          </div>
        </article>
      </>
    );
  else if (tab === "home")
    content = recommendations.stage === "calibration" ? renderSwipeExperience() : <CatalogFeed recommendations={recommendations} chosen={chosen} audienceFilter={audienceFilter} difficultyFilter={difficultyFilter} dateFrom={dateFrom} dateTo={dateTo} timeFilter={timeFilter} formatFilter={formatFilter} feedQuery={feedQuery} feedFiltersOpen={feedFiltersOpen} feedLimit={feedLimit} eventMatchesActiveFilters={eventMatchesActiveFilters} setFeedQuery={setFeedQuery} setFeedLimit={setFeedLimit} setFeedFiltersOpen={setFeedFiltersOpen} setDifficultyFilter={setDifficultyFilter} setDateFrom={setDateFrom} setDateTo={setDateTo} setTimeFilter={setTimeFilter} setFormatFilter={setFormatFilter} setAudienceFilter={setAudienceFilter} cityCatalogById={cityCatalogById} onSelect={openDetail} onLocate={shareLocationFromFeed} />;
  else if (tab === "map")
    content = <MapErrorBoundary><Suspense fallback={<div className="map-loading">Открываем карту…</div>}><VolunteerMap key={selectedCity} events={mapEvents} center={selectedCityOption.center} botUsername={data.botUsername} userName={data.user.name} userPhotoUrl={data.maxProfile?.photoUrl} onSelect={openDetail}/></Suspense></MapErrorBoundary>;
  else if (tab === "profile")
    content = <ProfilePage data={data} onOpenPlan={setSelectedPlanId} onDismissIntro={async () => {
      await api("/garden/intro-seen", "POST", {});
      setData(current => ({ ...current, user: { ...current.user, gardenIntroSeen: true } }));
    }} onUpdatePlan={update} onInvitePlan={inviteFriend} busy={busy}/>;
  else content = <CatalogFeed recommendations={recommendations} chosen={chosen} audienceFilter={audienceFilter} difficultyFilter={difficultyFilter} dateFrom={dateFrom} dateTo={dateTo} timeFilter={timeFilter} formatFilter={formatFilter} feedQuery={feedQuery} feedFiltersOpen={feedFiltersOpen} feedLimit={feedLimit} eventMatchesActiveFilters={eventMatchesActiveFilters} setFeedQuery={setFeedQuery} setFeedLimit={setFeedLimit} setFeedFiltersOpen={setFeedFiltersOpen} setDifficultyFilter={setDifficultyFilter} setDateFrom={setDateFrom} setDateTo={setDateTo} setTimeFilter={setTimeFilter} setFormatFilter={setFormatFilter} setAudienceFilter={setAudienceFilter} cityCatalogById={cityCatalogById} onSelect={openDetail} onLocate={shareLocationFromFeed} />;
  const cleanScreen = !detail && !selectedPlanId && !onboard && !settings;
  if (tab === "profile" && cleanScreen)
    return <div className="profile-garden-shell">{content}<BottomNav garden /></div>;
  if (tab === "map" && cleanScreen)
    return <div className="map-only-shell"><MapErrorBoundary><Suspense fallback={<div className="map-loading">Открываем карту…</div>}><VolunteerMap key={selectedCity} events={mapEvents} center={selectedCityOption.center} botUsername={data.botUsername} userName={data.user.name} userPhotoUrl={data.maxProfile?.photoUrl} onSelect={openDetail}/></Suspense></MapErrorBoundary><BottomNav garden /></div>;
  if (onboard && !detail && !settings)
    return <div className="interest-only-shell">{content}{toast && <div className={`toast${toastError ? ' toast-error' : ''}`} role={toastError ? 'alert' : 'status'}>{toastError ? <X size={18}/> : <Check size={18}/>}<span>{toast}</span><button aria-label="Закрыть уведомление" onClick={() => setToast("")}><X size={20}/></button></div>}</div>;
  if (tab === "home" && cleanScreen && recommendations.stage === "calibration")
    return <div className="swipe-only-shell">{renderSwipeExperience()}{toast && <div className={`toast${toastError ? ' toast-error' : ''}`} role={toastError ? 'alert' : 'status'}>{toastError ? <X size={18}/> : <Check size={18}/>}<span>{toast}</span><button aria-label="Закрыть уведомление" onClick={() => setToast("")}><X size={20}/></button></div>}</div>;
  return (
    <div className={`app${detail ? ' showing-detail' : ''}${settings ? ' showing-settings' : ''}`}>
      <aside className="sidebar">
        <button className="brand" aria-label="хелпи — на главную" onClick={() => go("home")}>
          <HelpiWordmark />
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
              {id === "profile" && active.length > 0 && (
                <span className="nav-count">{active.length}</span>
              )}
            </button>
          ))}
        </nav>
        <button
          className="profile-button"
          onClick={() => {
            setSettings(true);
            closeDetail();
            setOnboard(false);
          }}
        >
          <UserAvatar className="avatar" name={data.user.name} photoUrl={data.maxProfile?.photoUrl}/>
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
          <button type="button" className="mobile-brand" aria-label="хелпи — на главную" onClick={() => go("home")}><HelpiWordmark /></button>
          <div className="topbar-actions">
            <button
              className="top-settings"
              aria-label="Настройки"
              onClick={() => {
                setSettings(true);
                closeDetail();
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
        {!detail && !selectedPlanId && !settings && <footer className="app-footer">
          <span>хелпи © 2026</span>
          <span>Реальные дела · данные ДОБРО</span>
        </footer>}
      </div>
      <BottomNav />
      {tab === 'home' && cleanScreen && recommendations.stage === 'feed' && !ageDismissed && !(Number.isInteger(Number(profile.age)) && Number(profile.age) >= 7 && Number(profile.age) <= 100) && <AgePrompt value={registrationAge} onChange={setRegistrationAge} busy={busy} error={ageError} onLater={() => setAgeDismissed(true)} onSave={age => act(async () => { setAgeError(''); try { await save({ age }); setToast('Возраст сохранён'); } catch (error) { setAgeError(error.message); throw error; } })} />}
      {toast && (
        <div className={`toast${toastError ? ' toast-error' : ''}`} role={toastError ? 'alert' : 'status'}>
          {toastError ? <X size={18} /> : <Check size={18} />}
          <span>{toast}</span>
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
