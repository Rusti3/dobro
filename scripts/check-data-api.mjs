import assert from 'node:assert/strict';
import fs from 'node:fs';

const config = JSON.parse(fs.readFileSync(new URL('../DATA-API.yaml', import.meta.url), 'utf8'));
assert.equal(config.schema_version, '1.0');
const base = (process.env.DATA_API_BASE_URL || config.base_url).replace(/\/+$/, '');
if (!/^https:\/\//.test(base) && !/^http:\/\/127\.0\.0\.1(?::\d+)?$/.test(base))
  throw new Error('The verification target must be HTTPS or explicit localhost.');

let cookie = '';
const field = (value, key) => key.split('.').reduce((current, part) => current?.[part], value);
async function execute(check, context = {}) {
  const body = check.body ? JSON.parse(JSON.stringify(check.body).replaceAll('"$nextCalibrationEventId"', JSON.stringify(context.nextCalibrationEventId))) : undefined;
  const response = await fetch(`${base}${check.path}`, {
    method: check.method,
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.headers.get('set-cookie')) cookie = response.headers.get('set-cookie').split(';')[0];
  assert.equal(response.status, check.expect.status, check.id);
  assert.match(response.headers.get('content-type') || '', new RegExp(check.expect.content_type), check.id);
  const data = await response.json();
  for (const key of check.expect.required || []) assert.notEqual(field(data, key), undefined, `${check.id}: ${key}`);
  for (const [key, expected] of Object.entries(check.expect.equals || {})) assert.deepEqual(field(data, key), expected, `${check.id}: ${key}`);
  return data;
}

try {
  for (const check of config.checks) {
    for (let iteration = 0; iteration < (check.repeat || 1); iteration++) {
      let context = {};
      if (check.before) {
        const before = await execute({ id: `${check.id}.before.${iteration}`, ...check.before });
        context = { nextCalibrationEventId: before.recommendations.items[before.recommendations.completed]?.id };
        assert.ok(context.nextCalibrationEventId, `${check.id}: no calibration event`);
      }
      await execute(check, context);
    }
    process.stdout.write(`✓ ${check.id}\n`);
  }
} finally {
  if (cookie) await execute({ id: 'cleanup', ...config.cleanup }).catch(error => console.error('Cleanup failed:', error.message));
}
