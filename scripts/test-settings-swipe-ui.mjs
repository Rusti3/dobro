import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
fs.mkdirSync('test-results/onboarding', { recursive: true });
const base = process.env.SMOKE_URL || 'http://127.0.0.1:3210';
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await page.route('https://st.max.ru/js/max-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('helpi-theme-preference', 'dark'));
  const events = Array.from({ length: 6 }, (_, i) => ({ id: `ui-${i}`, title: `Доброе дело ${i + 1}`, short: `Доброе дело ${i + 1}`, theme: 'animals', themes: ['animals'], city: 'Москва', intro: 'Разовая помощь животным.', endsAt: '2030-01-01', traits: { format: 'offline' } }));
  const items = events.map(event => ({ id: event.id }));
  const payload = { mode: 'max', user: { id: 'test', name: 'Маша', registered: true, reminders: true, interestOnboarded: true, profile: { age: 23, city: 'Москва', interests: ['animals'] } }, plans: [], catalog: events, recommendations: { stage: 'calibration', completed: 0, target: 6, items } };
  let feedbackCount = 0, active = 0, maxActive = 0, failProfile = false;
  const saved = [];
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/bootstrap') return route.fulfill({ json: payload });
    if (path === '/api/recommendations/feedback') {
      active++; maxActive = Math.max(maxActive, active);
      saved.push(route.request().postDataJSON().eventId);
      await new Promise(resolve => setTimeout(resolve, 700));
      feedbackCount++; active--;
      payload.recommendations = { stage: feedbackCount === 6 ? 'feed' : 'calibration', completed: feedbackCount, target: 6, items };
      return route.fulfill({ json: { user: payload.user, recommendations: payload.recommendations } });
    }
    if (path === '/api/profile') {
      if (failProfile) return route.fulfill({ status: 500, json: { error: 'Не удалось сохранить данные. Попробуй снова.' } });
      const patch = route.request().postDataJSON();
      if (patch.registration) { payload.user.name = patch.registration.name; payload.user.profile.age = patch.registration.age; }
      if ('dailyDigest' in patch) payload.user.dailyDigest = patch.dailyDigest;
      return route.fulfill({ json: payload.user });
    }
    return route.fulfill({ json: { ok: true, location: null } });
  });
  await page.goto(base);
  await page.locator('.swipe-home-card').waitFor();
  const original = await page.locator('.swipe-home-card').elementHandle();
  await page.getByRole('button', { name: 'Мне подходит', exact: true }).click();
  await page.waitForTimeout(60);
  assert.equal(await original.evaluate(node => node.isConnected && node.style.transform.includes('translate3d')), true, 'outgoing DOM must not remount or snap back');
  await page.getByRole('heading', { name: 'Доброе дело 2', exact: true }).waitFor({ timeout: 500 });
  assert.equal(feedbackCount, 0, 'next card must not wait for API');
  const deck = await page.locator('.swipe-deck').boundingBox();
  await page.mouse.move(deck.x + 120, deck.y + 120); await page.mouse.down();
  await page.mouse.move(deck.x + 165, deck.y + 120, { steps: 3 }); await page.mouse.up();
  await page.getByRole('heading', { name: 'Доброе дело 3', exact: true }).waitFor({ timeout: 500 });
  await page.waitForTimeout(750);
  assert.equal(await page.locator('.swipe-count').innerText(), '3 / 6', 'early API acknowledgement must not rewind optimistic progress');
  for (let i = 2; i < 6; i++) {
    await page.getByRole('button', { name: 'Мне подходит', exact: true }).click();
    if (i < 5) await page.getByRole('heading', { name: `Доброе дело ${i + 2}`, exact: true }).waitFor();
  }
  await page.locator('.swipe-saving').waitFor();
  await page.locator('.daily-feed').waitFor({ timeout: 15000 });
  assert.equal(await page.locator('.calibration-complete').count(), 0);
  assert.equal(maxActive, 1); assert.deepEqual(saved, events.map(e => e.id));
  await page.getByRole('button', { name: 'Настройки', exact: true }).click();
  await page.locator('.settings-panel').waitFor();
  assert.equal(await page.locator('.settings-title').innerText(), 'Настройки');
  assert.equal(await page.getByLabel('Присылать рекомендации в MAX').isChecked(), true);
  for (const text of ['Сохранить личные данные', 'Изменить предпочтения', 'Доступно после подключения бота и команды /start.', 'Ты решаешь, когда возвращаться и чем делиться.']) assert.equal(await page.getByText(text, { exact: true }).count(), 0);
  assert.equal(await page.locator('.app-footer').count(), 0);
  await page.getByLabel('Имя', { exact: true }).fill('Анна');
  await page.locator('.settings-title').click();
  await page.getByText('Имя и возраст обновлены', { exact: true }).waitFor();
  assert.equal(payload.user.name, 'Анна');
  failProfile = true;
  await page.getByLabel('Имя', { exact: true }).fill('Ольга');
  await page.locator('.settings-title').click();
  const alert = page.getByRole('alert'); await alert.waitFor();
  const style = await alert.evaluate(node => ({ color: getComputedStyle(node).color, background: getComputedStyle(node).backgroundColor, font: parseFloat(getComputedStyle(node).fontSize) }));
  assert.equal(style.color, 'rgb(255, 255, 255)'); assert.equal(style.background, 'rgb(180, 35, 45)'); assert.ok(style.font >= 14);
  await page.screenshot({ path: 'test-results/onboarding/settings-error.png' });
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const gap = await page.locator('.settings-panel').evaluate(node => innerHeight - node.getBoundingClientRect().bottom);
  const canScroll = await page.evaluate(() => document.documentElement.scrollHeight > innerHeight + 1);
  if (canScroll) assert.ok(gap <= 115, `unnecessary blank scroll: ${gap}`);
  assert.deepEqual(errors, []);
  console.log('PASS: delayed button/gesture swipes, no rewind, ordered saves, default reminders, settings autosave, red/white errors and compact scroll');
} finally { await browser.close(); }
