const endpoint = () => (process.env.RECSYS_URL || 'http://127.0.0.1:3211').replace(/\/+$/, '');

export async function recsysHealth() {
  try {
    const response = await fetch(`${endpoint()}/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok ? await response.json() : { ok: false };
  } catch { return { ok: false }; }
}

export async function recsys(path, payload) {
  let response;
  try {
    const safeUser = payload.user && {
      id: payload.user.id,
      registered: payload.user.registered,
      profile: payload.user.profile,
      interestOnboarded: payload.user.interestOnboarded,
      onboarded: payload.user.onboarded,
      recommendation: payload.user.recommendation,
    };
    response = await fetch(`${endpoint()}/v1/${path}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, ...(safeUser ? { user: safeUser } : {}) }), signal: AbortSignal.timeout(3000),
    });
  } catch {
    throw Object.assign(new Error('Рекомендации временно недоступны. Попробуй ещё раз.'), { status: 503 });
  }
  let data;
  try { data = await response.json(); } catch { data = {}; }
  if (!response.ok) throw Object.assign(new Error(response.status >= 500 ? 'Рекомендации временно недоступны. Попробуй ещё раз.' : data.error || 'Некорректный запрос.'), { status: response.status >= 500 ? 503 : response.status });
  return data;
}
