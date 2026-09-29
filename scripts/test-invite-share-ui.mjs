import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('https://st.max.ru/js/max-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await page.addInitScript(() => {
    window.__shareCalls = [];
    window.WebApp = {
      initData: 'ui-test', ready() {}, expand() {},
      shareMaxContent(params) {
        window.__shareCalls.push(params);
        return window.__shareCalls.length === 1 ? Promise.reject(new Error('gesture expired')) : Promise.resolve();
      },
    };
  });
  const event = {
    id: '123', short: 'Помочь приюту', title: 'Помочь приюту',
    theme: 'animals', themes: ['animals'], category: 'animals',
    city: 'Москва', intro: 'Разовая помощь животным.', image: '/theme-images/animals.jpg',
    endsAt: '2030-01-01T00:00:00Z',
  };
  const plan = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', owner: 'max:12345', eventId: event.id, event, members: [], status: 'draft', checks: [] };
  const payload = {
    mode: 'max', botUsername: 'helpi_bot', maxProfile: { firstName: 'Анна' },
    user: { id: 'max:12345', name: 'Анна', registered: true, interestOnboarded: true, onboarded: true, reminders: true, profile: { age: 23, city: 'Москва', interests: ['animals'] } },
    plans: [], catalog: [event], location: null,
    recommendations: { stage: 'feed', sections: [{ id: 'daily', title: 'Что откликается сегодня?', eventIds: [event.id] }] },
  };
  let planCalls = 0, inviteCalls = 0;
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/bootstrap') return route.fulfill({ json: payload });
    if (path === '/api/plans' && route.request().method() === 'POST') {
      planCalls++;
      return route.fulfill({ status: 201, json: plan });
    }
    if (path === `/api/plans/${plan.id}/invite`) {
      inviteCalls++;
      assert.deepEqual(route.request().postDataJSON(), { shareInMax: true });
      return route.fulfill({ status: 201, json: { mid: 'mid.invite', chatType: 'DIALOG' } });
    }
    return route.fulfill({ json: { ok: true, location: null } });
  });
  await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:3210');
  await page.getByRole('button', { name: /Помочь приюту/ }).first().click();
  const invite = page.getByRole('button', { name: 'Позвать друга' });
  await invite.click();
  await page.getByRole('alert').getByText('MAX не открыл выбор чата. Нажми «Позвать друга» ещё раз.').waitFor();
  await invite.click();
  await page.waitForFunction(() => window.__shareCalls.length === 2);
  assert.deepEqual(await page.evaluate(() => window.__shareCalls), [
    { mid: 'mid.invite', chatType: 'DIALOG' },
    { mid: 'mid.invite', chatType: 'DIALOG' },
  ]);
  assert.equal(planCalls, 1);
  assert.equal(inviteCalls, 1);
  assert.equal(await page.locator('.share-box').count(), 0);
  assert.deepEqual(errors, []);

  const recipient = await browser.newPage({ viewport: { width: 430, height: 932 } });
  const recipientErrors = [];
  recipient.on('pageerror', error => recipientErrors.push(error.message));
  await recipient.route('https://st.max.ru/js/max-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
  await recipient.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/bootstrap') return route.fulfill({ json: payload });
    if (path === `/api/invites/${'b'.repeat(36)}`) return route.fulfill({ json: {
      event: { ...event, image: '/images/11013932.jpg' }, ownerName: 'Анна', when: null, joined: false,
    } });
    return route.fulfill({ json: { ok: true } });
  });
  await recipient.goto(`${process.env.SMOKE_URL || 'http://127.0.0.1:3210'}?invite=${'b'.repeat(36)}`);
  await recipient.locator('.detail-image img').waitFor();
  assert.equal(await recipient.locator('.detail-image img').getAttribute('src'), '/images/11013932.jpg');
  assert.equal(await recipient.locator('.invite-page').count(), 0);
  assert.equal(await recipient.getByRole('heading', { name: 'Помочь приюту' }).count(), 1);
  assert.equal(await recipient.getByRole('button', { name: 'Пойду вместе' }).count(), 1);
  await recipient.getByRole('button', { name: /К добрым делам/ }).click();
  assert.equal(new URL(recipient.url()).searchParams.has('invite'), false);
  await recipient.goto(`${process.env.SMOKE_URL || 'http://127.0.0.1:3210'}?startapp=i_${'b'.repeat(36)}`);
  await recipient.locator('.detail-image img').waitFor();
  assert.equal(await recipient.locator('.detail-image img').getAttribute('src'), '/images/11013932.jpg');
  assert.equal(await recipient.locator('.invite-page').count(), 0);
  assert.deepEqual(recipientErrors, []);
  await recipient.route('**/api/events/123', route => route.fulfill({ json: { ...event, image: '/images/11013932.jpg' } }));
  await recipient.goto(`${process.env.SMOKE_URL || 'http://127.0.0.1:3210'}?startapp=e_123`);
  await recipient.getByRole('heading', { name: 'Помочь приюту' }).waitFor();
  assert.equal(await recipient.locator('.detail-image img').getAttribute('src'), '/images/11013932.jpg');
  assert.equal(await recipient.getByRole('button', { name: 'Пойду вместе' }).count(), 0);
  assert.equal(await recipient.getByRole('link', { name: /Записаться на дело/ }).count(), 1);
  await recipient.getByRole('button', { name: /К добрым делам/ }).click();
  assert.equal(new URL(recipient.url()).searchParams.has('startapp'), false);
  assert.deepEqual(recipientErrors, []);
  console.log('PASS: daily digest opens event details directly in mini-app');
  console.log('PASS: MAX share retry and invite deep link opens the real event card directly');
} finally {
  await browser.close();
}
