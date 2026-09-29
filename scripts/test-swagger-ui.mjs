import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';

const base = process.env.API_TEST_URL || 'http://127.0.0.1:3212';
const browser = await chromium.launch({ channel: process.env.PLAYWRIGHT_CHANNEL || 'msedge', headless: true });
try {
  const page = await browser.newPage();
  const failures = [];
  page.on('pageerror', error => failures.push(error.message));
  const response = await page.goto(`${base}/api`, { waitUntil: 'networkidle' });
  assert.equal(response.status(), 200);
  await page.locator('.swagger-ui .opblock').first().waitFor();
  assert.equal(await page.getByRole('link', { name: 'OpenAPI YAML' }).count(), 1);
  assert.deepEqual(failures, []);
  const spec = await fetch(`${base}/api/openapi.yaml`);
  assert.equal(spec.status, 200);
  assert.match(await spec.text(), /openapi: 3\.0\.3/);
  console.log('PASS: public Swagger UI renders the bundled OpenAPI contract');
} finally {
  await browser.close();
}
