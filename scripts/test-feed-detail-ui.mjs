import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  await page.route('https://st.max.ru/js/max-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.addInitScript(() => {
    localStorage.setItem('helpi-theme-preference', 'dark');
    window.WebApp = { initData: 'ui-test', ready() {}, expand() {}, openMaxLink(link) { window.testBotLink = link; } };
  });
  const event = { id: 'ui-detail', title: 'Помощь животным', short: 'Помощь животным', theme: 'animals', themes: ['animals'], city: 'Москва', intro: 'Разовая помощь животным.', description: 'Описание', endsAt: '2030-01-01', age: '18+', annotation: { complexity: { overall: 50 }, feedSignals: {}, participation: {}, commitment: 'one_off', shortExplanation: 'Разовая помощь', format: 'on_site' }, traits: { format: 'offline' } };
  const payload = { mode: 'max', botUsername: 'test_bot', user: { id: 'ui', registered: true, name: 'Маша', reminders: true, profile: { age: 23, city: 'Москва', interests: ['animals'] } }, plans: [], catalog: [event], recommendations: { stage: 'feed', sections: [{ id: 'daily', title: 'Что откликается сегодня?', eventIds: [event.id] }, { id: 'nearby', title: 'Рядом с тобой', locationRequired: true, eventIds: [], subtitle: 'Поделись геопозицией' }] } };
  let requests = 0;
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/location/request') { requests++; return route.fulfill({ json: { botUsername: 'test_bot' } }); }
    return route.fulfill({ json: path === '/api/bootstrap' ? payload : { ok: true, location: null } });
  });
  await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:3210');
  await page.getByRole('button', { name: 'Поделиться геопозицией', exact: true }).click();
  await page.waitForFunction(() => window.testBotLink === 'https://max.ru/test_bot');
  assert.equal(requests, 1); assert.equal(await page.locator('.daily-feed').count(), 1);
  assert.equal(new URL(page.url()).searchParams.get('tab'), null);
  assert.equal(await page.locator('.insight-chip.difficulty').innerText(), 'Средняя сложность');
  await page.locator('.event-card').click();
  await page.locator('article.detail').waitFor();
  assert.equal(await page.getByText('Оригинальное описание ДОБРО', { exact: true }).count(), 0);
  assert.equal(await page.getByText('Сохраним личный план. Это ещё не регистрация.', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Записаться на дело', exact: true }).count(), 1);
  assert.equal(await page.locator('.app-footer').count(), 0);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const gap = await page.locator('article.detail').evaluate(node => innerHeight - node.getBoundingClientRect().bottom);
  assert.ok(gap <= 115, `unnecessary detail scroll gap: ${gap}`);
  assert.deepEqual(errors, []);
  console.log('PASS: feed opens MAX bot directly, difficulty text, simplified detail, compact scroll');
} finally { await browser.close(); }
