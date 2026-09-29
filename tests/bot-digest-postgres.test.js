import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPool, runMigrations } from "../server/database.js";
import { createStore } from "../server/store.js";
if (process.env.TEST_DATABASE_URL && !new URL(process.env.TEST_DATABASE_URL).pathname.includes('test')) throw new Error('Use an isolated test database');

test("daily digest is claimed once per user and Moscow day, with retry after failure", { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = createPool({ connectionString: process.env.TEST_DATABASE_URL, applicationName: "bot_digest_test" });
  const store = createStore(pool);
  const id = `max:test-${randomUUID()}`;
  const day = "2026-09-28";
  try {
    await runMigrations(pool);
    await store.saveUser({ id, name: "Тест", registered: true, reminders: true, profile: { city: "Москва", interests: [] } });
    assert.equal(await store.claimDailyDigest(id, day), true);
    assert.equal(await store.claimDailyDigest(id, day), false);
    await store.finishDailyDigest(id, day, false);
    assert.equal(await store.claimDailyDigest(id, day), false);
    await pool.query("update bot_daily_deliveries set next_attempt_at = now() - interval '1 second' where user_id = $1", [id]);
    assert.equal(await store.claimDailyDigest(id, day), true);
    await store.finishDailyDigest(id, day, true);
    assert.equal(await store.claimDailyDigest(id, day), false);
  } finally {
    await store.deleteUser(id).catch(() => {});
    await pool.end();
  }
});
