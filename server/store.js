const json = (value) => JSON.stringify(value);
import { decryptJson, decryptText, encryptJson, encryptText, encryptionEnabled, interactionKey } from "./private-data.js";

function planProjection(row) {
  if (!row) return null;
  const data = row.data_ciphertext ? decryptJson(row.data_ciphertext, `plans:${row.id}:data`) : (row.data || {});
  const members = (row.members || []).map((member) => member.display_name_ciphertext
    ? { id: member.id, name: decryptText(member.display_name_ciphertext, `plan_members:${row.id}:${member.id}:name`) }
    : { id: member.id, name: member.name });
  return {
    ...data,
    id: String(row.id),
    owner: row.owner_id,
    eventId: row.event_id,
    status: row.status,
    when: row.when_at ? new Date(row.when_at).toISOString() : null,
    members,
  };
}

const planSelect = `
  select p.id, p.owner_id, p.event_id, p.status, p.when_at, p.data, p.data_ciphertext,
    coalesce(
      jsonb_agg(jsonb_build_object('id', pm.user_id, 'name', pm.display_name, 'display_name_ciphertext', pm.display_name_ciphertext) order by pm.joined_at)
        filter (where pm.user_id is not null),
      '[]'::jsonb
    ) as members
  from plans p
  left join plan_members pm on pm.plan_id = p.id
`;

export function createStore(pool) {
  return {
    pool,

    async user(id) {
      const result = await pool.query("select id, name, data, name_ciphertext, data_ciphertext, garden_intro_seen from app_users where id = $1", [id]);
      const row = result.rows[0];
      if (!row) return null;
      const data = row.data_ciphertext ? decryptJson(row.data_ciphertext, `app_users:${id}:data`) : (row.data || {});
      data.name = row.name_ciphertext ? decryptText(row.name_ciphertext, `app_users:${id}:name`) : (data.name || row.name);
      data.gardenIntroSeen = row.garden_intro_seen;
      return data;
    },

    async saveUser(user) {
      const persisted = { ...user };
      delete persisted.gardenIntroSeen;
      delete persisted.sharedLocation;
      if (persisted.recommendation) persisted.recommendation = { ...persisted.recommendation, interactions: [] };
      const encrypted = encryptionEnabled();
      await pool.query(`
        insert into app_users (id, name, registered, reminders, data, name_ciphertext, data_ciphertext, created_at, updated_at)
        values ($1, $2, $3, $4, $5::jsonb, $6, $7, coalesce($8::timestamptz, now()), now())
        on conflict (id) do update set
          name = excluded.name,
          registered = excluded.registered,
          reminders = excluded.reminders,
          data = excluded.data,
          name_ciphertext = excluded.name_ciphertext,
          data_ciphertext = excluded.data_ciphertext,
          updated_at = now()
      `, [user.id, encrypted ? "encrypted" : (user.name || "Друг"), Boolean(user.registered), Boolean(user.reminders), encrypted ? "{}" : json(persisted), encrypted ? encryptText(user.name || "Друг", `app_users:${user.id}:name`) : null, encrypted ? encryptJson(persisted, `app_users:${user.id}:data`) : null, user.createdAt || null]);
      return user;
    },

    async markGardenIntroSeen(id) {
      await pool.query("update app_users set garden_intro_seen = true where id = $1", [id]);
    },

    async users() {
      const result = await pool.query("select id, name, data, name_ciphertext, data_ciphertext from app_users order by created_at");
      return result.rows.map((row) => {
        const data = row.data_ciphertext ? decryptJson(row.data_ciphertext, `app_users:${row.id}:data`) : (row.data || {});
        data.name = row.name_ciphertext ? decryptText(row.name_ciphertext, `app_users:${row.id}:name`) : (data.name || row.name);
        return data;
      });
    },

    async claimDailyDigest(userId, day) {
      const result = await pool.query(`insert into bot_daily_deliveries
        (user_id, day, status, attempts, lease_until, next_attempt_at)
        values ($1, $2::date, 'sending', 1, now() + interval '5 minutes', now())
        on conflict (user_id, day) do update set
          status = 'sending', attempts = bot_daily_deliveries.attempts + 1,
          lease_until = now() + interval '5 minutes', next_attempt_at = now()
        where bot_daily_deliveries.status <> 'sent'
          and bot_daily_deliveries.attempts < 5
          and (bot_daily_deliveries.status = 'failed' and bot_daily_deliveries.next_attempt_at <= now()
            or bot_daily_deliveries.status = 'sending' and bot_daily_deliveries.lease_until < now())
        returning user_id`, [userId, day]);
      return result.rowCount === 1;
    },

    async finishDailyDigest(userId, day, success) {
      await pool.query(`update bot_daily_deliveries set
        status = $3, lease_until = null,
        next_attempt_at = case when $3 = 'failed' then now() + interval '30 minutes' else now() end,
        sent_at = case when $3 = 'sent' then now() else sent_at end
        where user_id = $1 and day = $2::date and status = 'sending'`,
      [userId, day, success ? 'sent' : 'failed']);
    },

    async location(id) {
      await pool.query("delete from user_locations where user_id = $1 and expires_at <= now()", [id]);
      const result = await pool.query("select lat, lng, shared_at as at, expires_at, location_ciphertext from user_locations where user_id = $1 and expires_at > now()", [id]);
      const row = result.rows[0];
      if (!row) return null;
      const point = row.location_ciphertext ? decryptJson(row.location_ciphertext, `user_locations:${id}:point`) : { lat: row.lat, lng: row.lng, at: new Date(row.at).toISOString() };
      return { ...point, expiresAt: new Date(row.expires_at).toISOString() };
    },

    async setLocation(id, point) {
      if (!point) return pool.query("delete from user_locations where user_id = $1", [id]);
      const encrypted = encryptionEnabled();
      await pool.query(`insert into user_locations(user_id,lat,lng,shared_at,expires_at,location_ciphertext)
        values($1,$2,$3,now(),now()+interval '24 hours',$4)
        on conflict(user_id) do update set lat=excluded.lat,lng=excluded.lng,shared_at=excluded.shared_at,expires_at=excluded.expires_at,location_ciphertext=excluded.location_ciphertext`, [id, encrypted ? null : point.lat, encrypted ? null : point.lng, encrypted ? encryptJson({ ...point, at: new Date().toISOString() }, `user_locations:${id}:point`) : null]);
      return this.location(id);
    },

    async interactions(id) {
      const result = await pool.query(`select id,event_id as "eventId", action, context, idempotency_key as key,
        feature_version as "featureVersion", features, occurred_at as at,payload_ciphertext
        from recommendation_interactions where user_id=$1 order by id`, [id]);
      return result.rows.map((row) => row.payload_ciphertext
        ? decryptJson(row.payload_ciphertext, `recommendation_interactions:${id}:${row.id}:payload`)
        : { eventId: row.eventId, action: row.action, context: row.context, key: row.key,
          featureVersion: row.featureVersion, features: row.features, at: new Date(row.at).toISOString() });
    },

    async saveInteraction(id, item) {
      if (encryptionEnabled()) {
        const client = await pool.connect();
        try {
          await client.query("begin");
          const result = await client.query(`insert into recommendation_interactions
            (user_id,event_id,action,context,idempotency_key,feature_version,features,occurred_at)
            values($1,'encrypted','like','encrypted',$2,2,'{}'::jsonb,'epoch'::timestamptz)
            on conflict(user_id,idempotency_key) do nothing returning id`, [id, interactionKey(id, item.key)]);
          if (result.rowCount) await client.query(`update recommendation_interactions set payload_ciphertext=$2 where id=$1`,
            [result.rows[0].id, encryptJson(item, `recommendation_interactions:${id}:${result.rows[0].id}:payload`)]);
          await client.query("commit");
        } catch (error) { await client.query("rollback"); throw error; }
        finally { client.release(); }
        return;
      }
      await pool.query(`insert into recommendation_interactions(user_id,event_id,action,context,idempotency_key,feature_version,features,occurred_at)
        values($1,$2,$3,$4,$5,2,$6::jsonb,$7::timestamptz) on conflict(user_id,idempotency_key) do nothing`,
      [id,item.eventId,item.action,item.context,item.key,JSON.stringify(item.features || {}),item.at]);
    },

    async snapshotInteraction(id,item) {
      if (encryptionEnabled()) {
        const result = await pool.query(`select id,payload_ciphertext from recommendation_interactions
          where user_id=$1 and idempotency_key=$2`, [id, interactionKey(id, item.key)]);
        const row = result.rows[0];
        if (!row?.payload_ciphertext) return;
        const aad = `recommendation_interactions:${id}:${row.id}:payload`;
        const original = decryptJson(row.payload_ciphertext, aad);
        if (Object.keys(original.features || {}).length) return;
        await pool.query("update recommendation_interactions set payload_ciphertext=$2 where id=$1",
          [row.id, encryptJson({ ...original, featureVersion: 2, features: item.features }, aad)]);
        return;
      }
      await pool.query(`update recommendation_interactions set features=$3::jsonb,feature_version=2
        where user_id=$1 and idempotency_key=$2 and features='{}'::jsonb`,[id,item.key,JSON.stringify(item.features)]);
    },

    async plan(id) {
      const result = await pool.query(`${planSelect} where p.id = $1::uuid group by p.id`, [id]);
      return planProjection(result.rows[0]);
    },

    async createPlan(plan) {
      const client = await pool.connect();
      try {
        await client.query('begin');
        // Serializes only creation for this owner's event; no global bottleneck.
        await client.query('select pg_advisory_xact_lock(hashtextextended($1,0))', [`plan:${plan.owner}:${plan.eventId}`]);
        const existing = await client.query(`${planSelect} where p.owner_id=$1 and p.event_id=$2
          and p.status not in ('done','cancelled') group by p.id order by p.created_at limit 1`, [plan.owner,plan.eventId]);
        const result = existing.rowCount ? {plan:planProjection(existing.rows[0]),created:false}
          : {plan:await this.savePlan(plan,{client}),created:true};
        await client.query('commit');
        return result;
      } catch (error) { await client.query('rollback'); throw error; }
      finally { client.release(); }
    },

    async savePlan(plan, { client: providedClient, onlyOpen = false } = {}) {
      const client = providedClient || await pool.connect();
      try {
        if (!providedClient) await client.query("begin");
        const persisted = { ...plan };
        delete persisted.members;
        const encrypted = encryptionEnabled();
        const saved = await client.query(`
          insert into plans (id, owner_id, event_id, status, when_at, data, data_ciphertext, created_at, updated_at)
          values ($1::uuid, $2, $3, $4, $5::timestamptz, $6::jsonb, $7, coalesce($8::timestamptz, now()), now())
          on conflict (id) do update set
            owner_id = excluded.owner_id,
            event_id = excluded.event_id,
            status = excluded.status,
            when_at = excluded.when_at,
            data = excluded.data,
            data_ciphertext = excluded.data_ciphertext,
            updated_at = now()
          where $9::boolean = false or plans.status not in ('done','cancelled')
          returning id
        `, [plan.id, plan.owner, plan.eventId, plan.status, plan.when || null, encrypted ? "{}" : json(persisted), encrypted ? encryptJson(persisted, `plans:${plan.id}:data`) : null, plan.createdAt || null, onlyOpen]);
        if (!saved.rowCount) throw Object.assign(new Error('Этот план уже закрыт.'), {status:409});
        if (plan.members?.length) {
          const values = [];
          const placeholders = plan.members.map((member, index) => {
            const offset = index * 4;
            values.push(plan.id, member.id, encrypted ? "encrypted" : (member.name || "Друг"), encrypted ? encryptText(member.name || "Друг", `plan_members:${plan.id}:${member.id}:name`) : null);
            return `($${offset + 1}::uuid, $${offset + 2}, $${offset + 3}, $${offset + 4})`;
          });
          await client.query(`
            insert into plan_members (plan_id, user_id, display_name, display_name_ciphertext) values ${placeholders.join(", ")}
            on conflict (plan_id, user_id) do update set display_name = excluded.display_name, display_name_ciphertext = excluded.display_name_ciphertext
          `, values);
        }
        if (!providedClient) await client.query("commit");
        return plan;
      } catch (error) {
        if (!providedClient) await client.query("rollback");
        throw error;
      } finally {
        if (!providedClient) client.release();
      }
    },

    async joinPlan(planId, user) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query("select id from plans where id = $1::uuid for update", [planId]);
        const existing = await client.query("select 1 from plan_members where plan_id = $1::uuid and user_id = $2", [planId, user.id]);
        if (existing.rowCount) {
          await client.query("commit");
          return { joined: false, full: false };
        }
        const count = await client.query("select count(*)::int as count from plan_members where plan_id = $1::uuid", [planId]);
        if (count.rows[0].count >= 3) {
          await client.query("commit");
          return { joined: false, full: true };
        }
        await client.query(`
          insert into plan_members (plan_id, user_id, display_name, display_name_ciphertext)
          values ($1::uuid, $2, $3, $4)
          on conflict (plan_id, user_id) do nothing
        `, [planId, user.id, encryptionEnabled() ? "encrypted" : (user.name || "Друг"), encryptionEnabled() ? encryptText(user.name || "Друг", `plan_members:${planId}:${user.id}:name`) : null]);
        await client.query("commit");
        return { joined: true, full: false };
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },

    async leavePlan(planId, userId) {
      await pool.query("delete from plan_members where plan_id = $1::uuid and user_id = $2", [planId, userId]);
    },

    async plans() {
      const result = await pool.query(`${planSelect} group by p.id order by p.created_at desc`);
      return result.rows.map(planProjection);
    },

    async invite(token) {
      const result = await pool.query("select token, plan_id, expires_at from invites where token = $1", [token]);
      const row = result.rows[0];
      return row ? { token: row.token, plan: String(row.plan_id), expires: new Date(row.expires_at).getTime() } : null;
    },

    async saveInvite(token, planId, expires) {
      await pool.query(`
        insert into invites (token, plan_id, expires_at)
        values ($1, $2::uuid, to_timestamp($3 / 1000.0))
        on conflict (token) do update set plan_id = excluded.plan_id, expires_at = excluded.expires_at
      `, [token, planId, expires]);
    },

    async revoke(planId) {
      await pool.query("delete from invites where plan_id = $1::uuid", [planId]);
    },

    async meta(key) {
      const result = await pool.query("select value from service_meta where key = $1", [key]);
      return result.rows[0]?.value ?? null;
    },

    async setMeta(key, value) {
      await pool.query(`
        insert into service_meta (key, value) values ($1, $2)
        on conflict (key) do update set value = excluded.value, updated_at = now()
      `, [key, String(value)]);
    },

    async deleteUser(id) {
      await pool.query("delete from app_users where id = $1", [id]);
    },

    async close() {
      await pool.end();
    },
  };
}
