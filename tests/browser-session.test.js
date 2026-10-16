import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import http from 'node:http';
import { browserCookieName, readBrowserSession, setBrowserSession, sessionHash, requestLimiter } from '../server/browser-session.js';
import { handleRecSys } from '../server/recsys-service.js';
import { createPool, runMigrations } from '../server/database.js';

test('browser credential is opaque, host-scoped over HTTPS, and rejects duplicate cookies', () => {
  const token = randomBytes(32).toString('hex');
  const req = { headers: { 'x-forwarded-proto': 'https', cookie: `__Host-helpi_session=${token}` }, socket: {} };
  assert.equal(browserCookieName(req), '__Host-helpi_session');
  assert.equal(readBrowserSession(req), token);
  assert.notEqual(sessionHash(token), token);
  let cookie;
  setBrowserSession(req, { setHeader: (_, value) => { cookie = value; } }, token);
  for (const flag of ['HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/', 'Max-Age=15552000']) assert.ok(cookie.includes(flag));
  req.headers.cookie += `; __Host-helpi_session=${token}`;
  assert.equal(readBrowserSession(req), null);
  setBrowserSession(req, { setHeader: (_, value) => { cookie = value; } }, null);
  assert.ok(cookie.includes('Max-Age=0'));
});

test('anonymous limiter expires windows and bounds storage', () => {
  const allowed = requestLimiter({ limit: 2, windowMs: 100, maxBuckets: 2 });
  assert.equal(allowed('a', 0), true); assert.equal(allowed('a', 1), true); assert.equal(allowed('a', 2), false);
  assert.equal(allowed('b', 3), true); assert.equal(allowed('c', 4), false); assert.equal(allowed('c', 101), true);
});

const database = process.env.TEST_DATABASE_URL;
if (database && !new URL(database).pathname.includes('test')) throw new Error('Isolated test database required');
test('production browser sessions persist, isolate owners and preserve signed MAX authentication', { skip: !database }, async t => {
  const port = 35000 + Math.floor(Math.random() * 1000), base = `http://127.0.0.1:${port}`;
  const recsys = http.createServer(handleRecSys);
  await new Promise(resolve => recsys.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => recsys.close(resolve)));
  const pool = createPool({ connectionString: database });
  await runMigrations(pool);
  t.after(() => pool.end());
  let child, output = '';
  const botToken = 'isolated-test-bot-token';
  const encryptionKey = randomBytes(32).toString('base64');
  async function start() {
    child = spawn(process.execPath, ['server/index.js'], { cwd: new URL('..', import.meta.url), stdio: 'pipe', env: {
      ...process.env, NODE_ENV: 'production', DATABASE_URL: database, DB_SCHEMA: 'app', HOST: '127.0.0.1', PORT: String(port),
      DEMO_MODE: 'false', DEMO_DATA: 'false', BROWSER_ACCESS_ENABLED: 'true', MAX_BOT_TOKEN: botToken,
      MAX_MINI_APP_URL: 'https://helpi.test', MAX_BOT_USERNAME: 'test_bot', MAX_WEBHOOK_URL: '', MAX_POLLING: 'false',
      REQUIRE_PRIVATE_DATA_ENCRYPTION: 'true', PRIVATE_DATA_ENCRYPTION_KEY: encryptionKey, PRIVATE_DATA_ENCRYPTION_KEY_FILE: '',
      CATALOG_SYNC_ENABLED: 'false', ANNOTATION_ENABLED: 'false', CATALOG_ANNOTATED_ONLY: 'false',
      RECSYS_URL: `http://127.0.0.1:${recsys.address().port}`,
    } });
    child.stdout.on('data', bytes => { output += bytes; }); child.stderr.on('data', bytes => { output += bytes; });
    for (let n = 0; n < 150; n++) {
      try { if ((await fetch(base + '/api/health')).ok) return; } catch {}
      if (child.exitCode !== null) throw Error(output);
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw Error('Server startup timed out');
  }
  async function stop() { if (child && child.exitCode === null) { const exited = new Promise(resolve => child.once('exit', resolve)); child.kill(); await exited; } }
  t.after(stop);
  await start();
  const clients = [];
  function client() {
    let cookie = '';
    const request = async (path, method = 'GET', data, extra = {}) => {
      const r = await fetch(base + '/api' + path, { method, headers: { Host: 'helpi.test', 'X-Forwarded-Proto': 'https', Cookie: cookie, 'Content-Type': 'application/json', ...extra }, ...(data === undefined ? {} : { body: JSON.stringify(data) }) });
      if (r.headers.get('set-cookie')) cookie = r.headers.get('set-cookie').split(';')[0];
      return { status: r.status, data: await r.json(), cookie };
    };
    clients.push(request); return request;
  }
  const a = client(), b = client();
  const first = await a('/bootstrap');
  assert.equal(first.status, 200); assert.equal(first.data.mode, 'browser'); assert.match(first.data.user.id, /^web:/);
  assert.ok(!first.cookie.includes(first.data.user.id)); assert.equal(first.data.user.reminders, false);
  assert.equal(first.data.plans.length, 0, 'No synthetic plans in a real browser profile');
  const second = await b('/bootstrap'); assert.notEqual(first.data.user.id, second.data.user.id);
  const token = first.cookie.split('=')[1];
  const row = (await pool.query('select token_hash,user_id from browser_sessions where user_id=$1', [first.data.user.id])).rows[0];
  assert.equal(row.token_hash, sessionHash(token)); assert.notEqual(row.token_hash, token);
  await a('/profile', 'PATCH', { age: 23 });
  const eligible = (await a('/bootstrap')).data.catalog;
  assert.ok(eligible.length > 0);
  const plan = await a('/plans', 'POST', { eventId: eligible[0].id, mode: 'solo' });
  assert.equal(plan.status, 201);
  assert.equal((await b('/bootstrap')).data.plans.length, 0);
  assert.equal((await b(`/plans/${plan.data.id}`, 'PATCH', { status: 'cancelled' })).status, 404);
  await a('/garden/intro-seen', 'POST', {});
  assert.equal((await b('/bootstrap')).data.user.profile.age, null);
  assert.equal((await a('/bootstrap')).data.user.gardenIntroSeen, true);
  assert.equal((await a('/profile', 'PATCH', { age: 30 }, { Origin: 'https://evil.test' })).status, 403);
  assert.equal((await a('/profile', 'PATCH', { age: 30 }, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
  assert.equal((await a('/bootstrap', 'GET', undefined, { 'X-Max-Init-Data': 'invalid' })).status, 401);
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: 9876543210, first_name: 'MAXtest' }) });
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest();
  params.set('hash', createHmac('sha256', secret).update([...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n')).digest('hex'));
  const max = await a('/bootstrap', 'GET', undefined, { 'X-Max-Init-Data': params.toString() });
  assert.equal(max.status, 200); assert.equal(max.data.user.id, 'max:9876543210'); assert.equal(max.data.mode, 'max');
  assert.equal((await a('/bootstrap')).data.user.id, first.data.user.id);
  await stop(); await start();
  assert.equal((await a('/bootstrap')).data.user.profile.age, 23);
  await a('/me', 'DELETE', {});
  assert.equal((await pool.query('select 1 from browser_sessions where user_id=$1', [first.data.user.id])).rowCount, 0);
  assert.notEqual((await a('/bootstrap')).data.user.id, first.data.user.id);
  const current = (await b('/bootstrap')).data.user.id;
  await pool.query("update browser_sessions set expires_at=now()-interval '1 second' where user_id=$1", [current]);
  assert.notEqual((await b('/bootstrap')).data.user.id, current, 'An expired session cannot reopen its owner');
  await pool.query('delete from app_users where id=$1', [current]);
  for (const request of clients) await request('/me', 'DELETE', {});
  await pool.query('delete from app_users where id=$1', ['max:9876543210']);
});
