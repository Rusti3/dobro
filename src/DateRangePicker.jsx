import React, { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";

const weekDays = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const monthTitle = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" });
const shortDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" });
const isoDate = (year, month, day) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
const parsedDate = (value) => value ? new Date(`${value}T12:00:00`) : null;
const displayDate = (value) => value ? shortDate.format(parsedDate(value)) : "Не выбрано";

export default function DateRangePicker({ from, to, onApply }) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [month, setMonth] = useState(() => {
    const base = parsedDate(from) || new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });
  const root = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const dismiss = (event) => {
      if (event.key === "Escape" || (event.type === "pointerdown" && !root.current?.contains(event.target))) setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismiss);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismiss);
    };
  }, [open]);

  function openCalendar() {
    setDraftFrom(from);
    setDraftTo(to);
    const base = parsedDate(from) || new Date();
    setMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setOpen((current) => !current);
  }

  function chooseDay(day) {
    const chosen = isoDate(month.getFullYear(), month.getMonth(), day);
    if (!draftFrom || draftTo || chosen < draftFrom) {
      setDraftFrom(chosen);
      setDraftTo("");
    } else setDraftTo(chosen);
  }

  const firstDay = (month.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: days }, (_, index) => index + 1)];

  return <div className="date-picker" ref={root}>
    <button type="button" className={`date-picker-trigger ${from ? "selected" : ""}`} onClick={openCalendar} aria-expanded={open} aria-haspopup="dialog">
      <CalendarDays size={19}/><span>{from ? `${displayDate(from)}${to && to !== from ? ` — ${displayDate(to)}` : ""}` : "Выбрать даты"}</span><ChevronRight size={17}/>
    </button>
    {open && <div className="date-picker-popover" role="dialog" aria-label="Выбор периода" aria-modal="false">
      <div className="date-picker-heading"><strong>Выбери период</strong><button type="button" onClick={() => setOpen(false)} aria-label="Закрыть календарь"><X size={18}/></button></div>
      <div className="date-picker-range"><div><span>От</span><strong>{displayDate(draftFrom)}</strong></div><div><span>До</span><strong>{displayDate(draftTo)}</strong></div></div>
      <div className="date-picker-month"><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Предыдущий месяц"><ChevronLeft size={20}/></button><strong>{monthTitle.format(month)}</strong><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Следующий месяц"><ChevronRight size={20}/></button></div>
      <div className="date-picker-grid">{weekDays.map((label) => <span key={label} className="date-picker-weekday">{label}</span>)}{cells.map((day, index) => {
        const value = day ? isoDate(month.getFullYear(), month.getMonth(), day) : "";
        const endpoint = value && (value === draftFrom || value === draftTo);
        const between = value && draftFrom && draftTo && value > draftFrom && value < draftTo;
        return day ? <button type="button" key={value} className={`${endpoint ? "endpoint" : ""} ${between ? "between" : ""}`} aria-label={new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric" }).format(parsedDate(value))} aria-pressed={Boolean(endpoint || between)} onClick={() => chooseDay(day)}>{day}</button> : <span key={`blank-${index}`}/>;
      })}</div>
      <p className="date-picker-hint">Нажми начальную и конечную дату. Для одного дня нажми его дважды.</p>
      <div className="date-picker-actions"><button type="button" className="date-picker-clear" onClick={() => { onApply("", ""); setOpen(false); }}>Сбросить</button><button type="button" className="date-picker-apply" disabled={!draftFrom} onClick={() => { onApply(draftFrom, draftTo || draftFrom); setOpen(false); }}>Показать дела</button></div>
    </div>}
  </div>;
}
