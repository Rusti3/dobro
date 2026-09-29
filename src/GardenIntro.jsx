import React, { useEffect, useRef, useState } from "react";

export default function GardenIntro({ onDismiss }) {
  const dialog = useRef(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => { if (!dialog.current?.open) dialog.current?.showModal(); }, []);
  async function dismiss() {
    if (saving) return;
    setSaving(true);
    try { await onDismiss(); }
    catch { setError("Не удалось сохранить. Проверь соединение и попробуй ещё раз."); }
    finally { setSaving(false); }
  }
  return <dialog ref={dialog} className="garden-intro" aria-labelledby="garden-intro-title"
    onCancel={event => { event.preventDefault(); dismiss(); }}>
    <h2 id="garden-intro-title">Твой сад</h2>
    <p>Сад растёт вместе с твоими добрыми делами. Завершай дела — и здесь будут появляться новые растения.</p>
    {error && <p className="garden-intro-error" role="alert">{error}</p>}
    <button className="primary" disabled={saving} onClick={dismiss}>{saving ? "Сохраняем…" : "Посмотреть сад"}</button>
  </dialog>;
}
