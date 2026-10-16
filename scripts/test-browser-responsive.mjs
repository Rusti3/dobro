import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const base = process.env.DEMO_TEST_URL || 'http://127.0.0.1:3210';
assert.equal((await (await fetch(base + '/api/health')).json()).mode, 'demo', 'Use an isolated demo');
fs.mkdirSync('test-results/browser', { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
try {
  for (const [name, width, height, colorScheme] of [['desktop',1440,1000,'light'],['mobile',430,932,'dark']]) {
    const context = await browser.newContext({ viewport: { width, height }, colorScheme, permissions: ['clipboard-read','clipboard-write'] });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('https://st.max.ru/js/max-web-app.js', route => route.fulfill({ contentType: 'application/javascript', body: '' }));
    try {
      await page.goto(base, { waitUntil: 'domcontentloaded' });
      await page.getByRole('heading', { name: 'Что тебе близко?' }).waitFor();
      await page.locator('.interest-card').first().click();
      await page.screenshot({ path: `test-results/browser/${name}-interests.png` });
      await page.getByRole('button', { name: 'Настроить ленту' }).click();
      await page.getByRole('button', { name: 'Нет, впервые' }).click();
      await page.locator('.swipe-count').getByText('1 / 6').waitFor();
      await page.screenshot({ path: `test-results/browser/${name}-calibration.png` });
      for (let i = 0; i < 6; i++) {
        await page.getByRole('button', { name: 'Мне подходит', exact: true }).click();
        if (i < 5) await page.locator('.swipe-count').getByText(`${i+2} / 6`).waitFor();
      }
      const age = page.getByRole('dialog', { name: 'Сколько тебе лет?' });
      await age.getByLabel('Возраст', { exact: true }).fill('23');
      await age.getByRole('button', { name: 'Сохранить', exact: true }).click();
      const location = page.getByRole('dialog', { name: 'Показать дела рядом?' });
      await location.getByRole('button', { name: 'Не сейчас' }).click();
      await location.waitFor({ state: 'detached' });
      await page.locator('.event-card').first().waitFor();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.screenshot({ path: `test-results/browser/${name}-feed.png`, fullPage: false });
      if (name === 'desktop') {
        assert.equal(await page.locator('.sidebar').isVisible(), true);
        const next = page.locator('.feed-rail-controls button:not([disabled])').first();
        await next.click();
        await page.waitForFunction(() => [...document.querySelectorAll('.feed-rail')].some(rail => rail.scrollLeft > 10));
      }
      await page.locator('.event-card').first().click();
      await page.getByRole('link', { name: 'Записаться на дело' }).waitFor();
      assert.match(await page.getByRole('link', { name: 'Записаться на дело' }).getAttribute('href'), /^https:\/\/dobro.ru/);
      await page.screenshot({ path: `test-results/browser/${name}-detail.png` });
      await page.getByRole('button', { name: 'Позвать друга', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Ссылка-приглашение скопирована' }).waitFor();
      const link = await page.evaluate(() => navigator.clipboard.readText());
      assert.ok(link.startsWith(base + '/?invite='));
      await page.getByRole('button', { name: 'Сохранить дело', exact: true }).click();
      await page.getByRole('button', { name: 'К саду', exact: true }).click();
      await page.getByRole('dialog', { name: 'Твой сад' }).getByRole('button', { name: 'Посмотреть сад' }).click();
      await page.locator('.garden-3d canvas').waitFor({ timeout: 45000 });
      await page.screenshot({ path: `test-results/browser/${name}-garden.png` });
      await page.locator((name === 'desktop' ? '.sidebar' : '.garden-nav') + ' .nav-map').click();
      await page.getByRole('button', { name: 'Что рядом', exact: true }).waitFor();
      await page.screenshot({ path: `test-results/browser/${name}-map.png` });
      await page.locator((name === 'desktop' ? '.sidebar' : '.garden-nav') + ' .nav-home').click();
      await page.locator(name === 'desktop' ? '.sidebar .profile-button' : '.top-settings').click();
      await page.getByRole('heading', { name: 'Настройки', exact: true }).waitFor();
      await page.screenshot({ path: `test-results/browser/${name}-settings.png` });
      await page.reload();
      await page.locator('.event-card').first().waitFor();
      assert.equal(await page.locator('.interest-panel').count(), 0);
      for (const size of [768,1024,1280,1920]) {
        await page.setViewportSize({ width: size, height: 900 });
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, `Overflow at ${size}px`);
      }
      assert.deepEqual(errors, []);
      console.log(`PASS ${name} ${colorScheme}: interests → 6 swipes → age → feed → save/share → garden/map → settings → reload; 430–1920px`);
    } catch (error) { await page.screenshot({ path: `test-results/browser/${name}-failed.png` }); throw error; }
    finally { await context.request.delete(base + '/api/me', { data: {} }); await context.close(); }
  }
} finally { await browser.close(); }
