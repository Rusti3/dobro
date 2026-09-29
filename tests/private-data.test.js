import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createPool, runMigrations } from "../server/database.js";
import { createStore } from "../server/store.js";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (databaseUrl && !new URL(databaseUrl).pathname.includes('test')) throw new Error('Use an isolated test database');

test("private profile, location and plan fields are encrypted at rest", { skip: !databaseUrl }, async () => {
  const previousKey = process.env.PRIVATE_DATA_ENCRYPTION_KEY;
  const userId = `encryption-test-${randomUUID()}`;
  const eventId = `encryption-test-event-${randomUUID()}`;
  const planId = randomUUID();
  process.env.PRIVATE_DATA_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
  const pool = createPool({ connectionString: databaseUrl, applicationName: "dobrie_dela_private_data_test" });
  try {
    await runMigrations(pool);
    await pool.query("insert into events(id,title,ends_at,catalog_data) values($1,$2,now()+interval '1 day','{}'::jsonb)", [eventId, "Encryption test"]);
    const store = createStore(pool);
    await store.saveUser({ id: userId, name: "Секретное имя", registered: true, reminders: false, profile: { age: 31 }, recommendation: { interactions: [] } });
    await store.setLocation(userId, { lat: 55.75, lng: 37.61 });
    await store.savePlan({ id: planId, owner: userId, eventId, status: "draft", when: null, meeting: "Секретное место", members: [] });
    await store.saveInteraction(userId, { eventId, action: "like", context: "daily", key: `private-${eventId}`, featureVersion: 2, features: { tasks: ["private-task"] }, at: new Date().toISOString() });

    const rows = await pool.query(`select u.name, u.data, u.name_ciphertext, u.data_ciphertext,
      p.data as plan_data, p.data_ciphertext as plan_ciphertext, l.lat, l.lng, l.location_ciphertext
      from app_users u join plans p on p.owner_id=u.id join user_locations l on l.user_id=u.id where u.id=$1`, [userId]);
    const row = rows.rows[0];
    assert.equal(row.name, "encrypted");
    assert.deepEqual(row.data, {});
    assert.match(row.name_ciphertext, /^enc:v1:/);
    assert.match(row.plan_ciphertext, /^enc:v1:/);
    assert.deepEqual(row.plan_data, {});
    assert.match(row.data_ciphertext, /^enc:v1:/);
    assert.equal(row.lat, null);
    assert.equal(row.lng, null);
    assert.match(row.location_ciphertext, /^enc:v1:/);
    assert.equal((await store.user(userId)).name, "Секретное имя");
    assert.equal((await store.location(userId)).lat, 55.75);
    assert.equal((await store.plan(planId)).meeting, "Секретное место");
    const history = (await pool.query("select event_id,action,context,idempotency_key,features,payload_ciphertext from recommendation_interactions where user_id=$1", [userId])).rows[0];
    assert.equal(history.event_id, "encrypted");
    assert.equal(history.context, "encrypted");
    assert.notEqual(history.idempotency_key, `private-${eventId}`);
    assert.deepEqual(history.features, {});
    assert.match(history.payload_ciphertext, /^enc:v1:/);
    assert.equal((await store.interactions(userId))[0].eventId, eventId);
  } finally {
    await pool.query("delete from app_users where id=$1", [userId]).catch(() => {});
    await pool.query("delete from events where id=$1", [eventId]).catch(() => {});
    await pool.end();
    if (previousKey === undefined) delete process.env.PRIVATE_DATA_ENCRYPTION_KEY;
    else process.env.PRIVATE_DATA_ENCRYPTION_KEY = previousKey;
  }
});
