import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const browser = await chromium.launch({ channel: 'msedge', headless: true });
fs.mkdirSync('test-results/onboarding', { recursive: true });
try {
  for (const theme of ['dark', 'light']) {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.emulateMedia({ colorScheme: theme });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.route('https://st.max.ru/js/max-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    await page.addInitScript(() => { window.WebApp = { initData: 'ui-test', ready() {}, expand() {} }; });
    const events = Array.from({ length: 6 }, (_, i) => ({ id: `age-ui-${i}`, selectedVacancyId: `vacancy-${i}`, short: `Дело ${i + 1}`, title: `Дело ${i + 1}`, theme: 'animals', themes: ['animals'], city: 'Москва', endsAt: '2030-01-01', traits: { format: 'offline' } }));
    const items = events.map(e => ({ id: e.id }));
    const payload = { mode: 'max', user: { id: 'max:ui', name: 'Маша', registered: true, interestOnboarded: false, reminders: true, profile: { city: 'Москва', interests: [], age: null } }, maxProfile: { firstName: 'Маша', photoUrl: 'https://example.org/avatar.jpg' }, plans: [], catalog: events, recommendations: { stage: 'interests' } };
    let completed = 0, failAge = true, ageRequests = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/recommendations/feedback') {
        completed++; payload.recommendations = { stage: completed === 6 ? 'feed' : 'calibration', completed, target: 6, items };
        return route.fulfill({ json: { user: payload.user, recommendations: payload.recommendations } });
      }
      if (path === '/api/profile') {
        const patch = route.request().postDataJSON();
        if (patch.interests) { payload.user.interestOnboarded = true; payload.user.profile.interests = patch.interests; payload.recommendations = { stage: 'calibration', completed: 0, target: 6, items }; }
        if ('age' in patch) {
          ageRequests++; assert.deepEqual(Object.keys(patch), ['age']);
          if (failAge) return route.fulfill({ status: 500, json: { error: 'Не удалось сохранить возраст. Попробуй снова.' } });
          payload.user.profile.age = patch.age;
        }
        return route.fulfill({ json: payload.user });
      }
      return route.fulfill({ json: path === '/api/bootstrap' ? payload : { ok: true, location: null } });
    });
    await page.goto(`${process.env.SMOKE_URL || 'http://127.0.0.1:3210'}/?tab=map`);
    await page.locator('.interest-panel').waitFor();
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    const artwork = await page.locator('.interest-image').evaluateAll(nodes => nodes.map(node => getComputedStyle(node).backgroundImage));
    assert.equal(artwork.length,14);
    assert.equal(new Set(artwork.filter(value => value !== 'none')).size,14);
    await page.screenshot({ path: `test-results/onboarding/interests-${theme}.png` });
    assert.equal(await page.locator('.registration-screen').count(), 0); assert.equal(await page.locator('.age-prompt').count(), 0);
    await page.getByRole('button', { name: 'Настроить ленту' }).click();
    for (let i = 0; i < 6; i++) {
      await page.getByRole('heading', { name: `Дело ${i + 1}`, exact: true }).waitFor();
      assert.equal(await page.locator('.age-prompt').count(), 0);
      await page.getByRole('button', { name: 'Мне подходит', exact: true }).click();
    }
    const dialog = page.getByRole('dialog', { name: 'Сколько тебе лет?' }); await dialog.waitFor();
    assert.equal(await page.locator('.daily-feed').count(), 1); assert.equal(await page.locator('.calibration-complete').count(), 0);
    assert.equal(await dialog.getByLabel('Имя', { exact: true }).count(), 0);
    assert.equal(await page.locator('#feed-age').evaluate(e => e === document.activeElement), true);
    const save = dialog.getByRole('button', { name: 'Сохранить', exact: true }); assert.equal(await save.isDisabled(), true);
    await dialog.getByLabel('Возраст', { exact: true }).fill('6'); assert.equal(await save.isDisabled(), true);
    await dialog.getByLabel('Возраст', { exact: true }).fill('23');
    await page.screenshot({ path: `test-results/onboarding/age-${theme}.png` });
    await save.click(); await dialog.getByRole('alert').waitFor();
    failAge = false; await save.click(); await dialog.waitFor({ state: 'detached' });
    assert.equal(payload.user.name, 'Маша'); assert.equal(completed, 6); assert.equal(ageRequests, 2);
    await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:3210'); await page.locator('.daily-feed').waitFor(); assert.equal(await page.locator('.age-prompt').count(), 0);
    await page.getByRole('button', { name: /Дело 1/ }).first().click();
    assert.equal(await page.getByRole('link', { name: 'Записаться на дело' }).getAttribute('href'), 'https://dobro.ru/event/age-ui-0/vacancy/vacancy-0');
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    assert.equal(await page.getByText('Оформление', { exact: true }).count(),0);
    await page.getByRole('button', { name: 'Назад' }).click();
    payload.user.profile.age = null; await page.reload(); await page.locator('.age-prompt').waitFor();
    await page.keyboard.press('Escape'); assert.equal(await page.locator('.age-prompt').count(), 0); assert.equal(await page.locator('.daily-feed').count(), 1);
    assert.deepEqual(errors, []); await page.close();
    console.log(`PASS ${theme}: no registration, interests → 6 swipes → age popup; validation, retry, preservation, reload, Escape`);
  }
} finally { await browser.close(); }
