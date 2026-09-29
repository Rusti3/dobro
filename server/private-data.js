import fs from "node:fs";
import path from "node:path";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1";
const KEY_BYTES = 32;

function decodeKey(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const decoded = /^[a-f0-9]{64}$/i.test(value) ? Buffer.from(value, "hex") : Buffer.from(value, "base64");
  if (decoded.length !== KEY_BYTES) throw new Error("PRIVATE_DATA_ENCRYPTION_KEY must be 32 bytes (base64 or hex).");
  return decoded;
}

export function privateDataKey() {
  const fromFile = process.env.PRIVATE_DATA_ENCRYPTION_KEY_FILE;
  if (fromFile) {
    try { return decodeKey(fs.readFileSync(path.resolve(fromFile), "utf8")); }
    catch (error) { throw new Error(`Cannot read private-data encryption key: ${error.message}`); }
  }
  return decodeKey(process.env.PRIVATE_DATA_ENCRYPTION_KEY);
}

export function requirePrivateDataKey() {
  const key = privateDataKey();
  if (!key) throw new Error("PRIVATE_DATA_ENCRYPTION_KEY_FILE is required in production.");
  return key;
}

export function encryptionEnabled() { return Boolean(privateDataKey()); }
function encoded(buffer) { return buffer.toString("base64url"); }
function decoded(value) { return Buffer.from(value, "base64url"); }

export function encryptText(value, aad = "") {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", requirePrivateDataKey(), iv);
  cipher.setAAD(Buffer.from(aad, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(String(value ?? ""), "utf8"), cipher.final()]);
  return [PREFIX, encoded(cipher.getAuthTag()), encoded(iv), encoded(ciphertext)].join(":");
}

export function decryptText(value, aad = "") {
  if (value == null) return null;
  const text = String(value);
  if (!text.startsWith(`${PREFIX}:`)) return text;
  const [, version, tagText, ivText, ciphertextText] = text.split(":");
  if (version !== "v1" || !ivText || !tagText || !ciphertextText) throw new Error("Invalid encrypted private-data payload.");
  const decipher = createDecipheriv("aes-256-gcm", requirePrivateDataKey(), decoded(ivText));
  decipher.setAAD(Buffer.from(aad, "utf8"));
  decipher.setAuthTag(decoded(tagText));
  return Buffer.concat([decipher.update(decoded(ciphertextText)), decipher.final()]).toString("utf8");
}

export function encryptJson(value, aad = "") { return encryptText(JSON.stringify(value), aad); }
export function decryptJson(value, aad = "") { return value == null ? null : JSON.parse(decryptText(value, aad)); }
export function interactionKey(userId, key) { return createHash("sha256").update(`${userId}:${key}`).digest("hex"); }

export async function migratePrivateData(pool) {
  if (!encryptionEnabled()) return { enabled: false, migrated: 0 };
  const client = await pool.connect();
  let migrated = 0;
  try {
    await client.query("begin");
    const locked = (await client.query("select pg_try_advisory_xact_lock(hashtext('dobrie_dela_private_data')) as locked")).rows[0].locked;
    if (!locked) { await client.query("commit"); return { enabled: true, migrated: 0, skipped: true }; }
    const users = await client.query("select id, name, data from app_users where data_ciphertext is null or name_ciphertext is null");
    for (const row of users.rows) {
      await client.query("update app_users set name='encrypted', data='{}'::jsonb, name_ciphertext=$2, data_ciphertext=$3, updated_at=now() where id=$1", [row.id, encryptText(row.name, `app_users:${row.id}:name`), encryptJson(row.data || {}, `app_users:${row.id}:data`)]);
      migrated += 1;
    }
    const plans = await client.query("select id, data from plans where data_ciphertext is null");
    for (const row of plans.rows) {
      await client.query("update plans set data='{}'::jsonb, data_ciphertext=$2, updated_at=now() where id=$1", [row.id, encryptJson(row.data || {}, `plans:${row.id}:data`)]);
      migrated += 1;
    }
    const members = await client.query("select plan_id, user_id, display_name from plan_members where display_name_ciphertext is null");
    for (const row of members.rows) {
      await client.query("update plan_members set display_name='encrypted', display_name_ciphertext=$3 where plan_id=$1 and user_id=$2", [row.plan_id, row.user_id, encryptText(row.display_name, `plan_members:${row.plan_id}:${row.user_id}:name`)]);
      migrated += 1;
    }
    const locations = await client.query("select user_id, lat, lng, shared_at from user_locations where location_ciphertext is null");
    for (const row of locations.rows) {
      await client.query("update user_locations set lat=null, lng=null, location_ciphertext=$2 where user_id=$1", [row.user_id, encryptJson({ lat: row.lat, lng: row.lng, at: new Date(row.shared_at).toISOString() }, `user_locations:${row.user_id}:point`)]);
      migrated += 1;
    }
    const interactions = await client.query(`select id,user_id,event_id,action,context,idempotency_key,feature_version,features,occurred_at
      from recommendation_interactions where payload_ciphertext is null order by id`);
    for (const row of interactions.rows) {
      const payload = { eventId: row.event_id, action: row.action, context: row.context,
        key: row.idempotency_key, featureVersion: row.feature_version, features: row.features || {},
        at: new Date(row.occurred_at).toISOString() };
      await client.query(`update recommendation_interactions set event_id='encrypted',action='like',context='encrypted',
        idempotency_key=$2,feature_version=2,features='{}'::jsonb,occurred_at='epoch'::timestamptz,payload_ciphertext=$3 where id=$1`,
      [row.id, interactionKey(row.user_id, row.idempotency_key), encryptJson(payload, `recommendation_interactions:${row.user_id}:${row.id}:payload`)]);
      migrated += 1;
    }
    await client.query("commit");
    return { enabled: true, migrated };
  } catch (error) { await client.query("rollback"); throw error; }
  finally { client.release(); }
}
