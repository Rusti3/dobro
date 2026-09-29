import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const browser = await chromium.launch({ channel: 'msedge', headless: true });
fs.mkdirSync('test-results/notifications', { recursive: true });
try {
  for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({ viewport: { width: 430, height: 932 } });
    await page.addInitScript(value => localStorage.setItem('helpi-theme-preference', value), theme);
    const data = { mode: 'demo', user: { id: 'ui-only', name: 'Маша', registered: true, reminders: true, profile: { age: 23, city: 'Москва', interests: [] } }, plans: [], catalog: [], recommendations: { stage: 'feed', sections: [] } };
    // Mock deletion entirely: this test never deletes a real account.
    await page.route('**/api/**', async route => {
      if (route.request().method() === 'DELETE') {
        await new Promise(resolve => setTimeout(resolve, 1200));
        data.user.registered = false;
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: new URL(route.request().url()).pathname === '/api/bootstrap' ? data : { ok: true, location: null } });
    });
    await page.goto(process.env.SMOKE_URL || 'http://127.0.0.1:3210');
    await page.getByRole('button', { name: 'Настройки', exact: true }).click();
    await page.getByText('Удалить профиль и планы', { exact: true }).click();
    await page.getByRole('button', { name: 'Удалить мои данные', exact: true }).click();
    const busy = page.locator('.busy'); await busy.waitFor();
    const contrast = element => {
      const style = getComputedStyle(element);
      const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
      const luminance = color => {
        context.fillStyle = color; context.fillRect(0, 0, 1, 1);
        const c = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; });
        return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
      };
      const a = luminance(style.color), b = luminance(style.backgroundColor);
      return { color: style.color, background: style.backgroundColor, contrast: (Math.max(a, b) + .05) / (Math.min(a, b) + .05), font: parseFloat(style.fontSize) };
    };
    const savingStyle = await busy.evaluate(contrast);
    assert.equal(savingStyle.color, 'rgb(255, 255, 255)');
    assert.equal(savingStyle.background, 'rgb(180, 35, 45)');
    assert.ok(savingStyle.font >= 14); assert.ok(savingStyle.contrast >= 4.5);
    await page.screenshot({ path: `test-results/notifications/saving-${theme}.png` });
    await page.getByText('Данные удалены', { exact: true }).waitFor();
    const resultStyle = await page.locator('.toast').evaluate(contrast);
    assert.equal(resultStyle.color, 'rgb(255, 255, 255)'); assert.ok(resultStyle.contrast >= 4.5);
    await page.screenshot({ path: `test-results/notifications/deleted-${theme}.png` });
    await page.close();
    console.log(`PASS ${theme}: deletion progress is red/white; success notification contrast >= 4.5`);
  }
} finally { await browser.close(); }
