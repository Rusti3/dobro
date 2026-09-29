import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { compareAnnotationRecords } from "./annotation-projection.js";
import { sourceToCatalog } from "./dobro-source.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const hashJson = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createCatalogRepository(pool) {
  return {
    async seedFromBundledCatalog() {
      const file = path.join(root, "data", "catalog.json");
      if (!fs.existsSync(file)) return 0;
      const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
      if (!catalog.length) return 0;
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const event of catalog) {
          await client.query(`
            insert into events (
              id, source, source_url, title, city, starts_at, ends_at, is_active,
              content_hash, raw_data, catalog_data, first_seen_at, last_seen_at, updated_at
            ) values ($1, 'dobro', $2, $3, $4, $5::timestamptz, $6::timestamptz,
              coalesce($6::timestamptz, now() + interval '100 years') > now(), $7, null, $8::jsonb, now(), now(), now())
            on conflict (id) do nothing
          `, [event.id, event.url || null, event.title, event.city || null, event.startsAt || null, event.endsAt || null, hashJson(event), JSON.stringify(event)]);
          if (event.city) await client.query(`
            insert into event_cities (event_id, city, last_seen_at) values ($1, $2, now())
            on conflict (event_id, city) do nothing
          `, [event.id, event.city]);
        }
        await client.query("commit");
        return catalog.length;
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },

    async listActive() {
      const demoData = process.env.DEMO_DATA === 'true' && process.env.DEMO_MODE !== 'false';
      const annotatedOnly = !demoData && process.env.CATALOG_ANNOTATED_ONLY === 'true';
      const result = await pool.query(`
        select id, catalog_data,
          coalesce((select jsonb_agg(ec.city) from event_cities ec where ec.event_id=events.id),'[]'::jsonb) as cities
        from events
        where is_active
          and ($1::boolean = (source = 'demo'))
          and (ends_at is null or ends_at > now())
        order by coalesce(starts_at, first_seen_at), id
      `, [demoData]);
      const variants = await pool.query(`select v.event_id, v.id, v.raw_data, e.raw_data as event, a.vacancy_id is not null as annotation_exists,
        case when a.input_hash=v.input_hash then a.compact_annotation else null end as annotation
        from vacancies v join events e on e.id=v.event_id
        left join event_annotations a on a.vacancy_id=v.id
        where v.is_active and e.is_active and (e.ends_at is null or e.ends_at>now())
          and ($1::boolean = false or (a.input_hash=v.input_hash and a.compact_annotation is not null))`, [annotatedOnly]);
      const grouped = new Map();
      const previous = new Map(result.rows.map(row=>[row.id,row.catalog_data]));
      const cities = new Map(result.rows.map((row) => [row.id,row.cities]));
      for (const row of variants.rows) {
        const rawEvent = row.raw_data.online === undefined || row.raw_data.online === null ? row.event : {...row.event,online:row.raw_data.online};
        const event = sourceToCatalog(rawEvent, [row.raw_data], cities.get(row.event_id) || []);
        event.selectedVacancyId = row.id;
        event.annotation = row.annotation;
        // Old bundled annotation is only applicable to the same vacancy.
        if (!event.annotation && !annotatedOnly) {
          const old = previous.get(row.event_id)?.annotation;
          if (String(old?.selectedVacancyId) === row.id && !row.annotation_exists) event.annotation = old;
        }
        if (event.annotation?.themeIds?.length) event.themes = event.annotation.themeIds;
        if (event.annotation?.facts?.minimumAge != null) event.age = String(event.annotation.facts.minimumAge);
        event.matchedCities = cities.get(row.event_id) || [];
        if (!grouped.has(row.event_id)) grouped.set(row.event_id, []);
        grouped.get(row.event_id).push(event);
      }
      return result.rows.filter(row => !annotatedOnly || grouped.has(row.id))
        .map((row) => ({ ...row.catalog_data, matchedCities: row.cities, variants: grouped.get(row.id) || [] }));
    },

    async event(id) {
      const result = await pool.query("select catalog_data from events where id = $1", [String(id)]);
      return result.rows[0]?.catalog_data ?? null;
    },

    async historicalEvents(ids) {
      if(!ids.length) return [];
      const result=await pool.query('select catalog_data from events where id=any($1::text[])',[ids]);
      return result.rows.map(row=>row.catalog_data);
    },

    async counts() {
      const result = await pool.query(`
        select
          count(*) filter (where is_active and (ends_at is null or ends_at > now()))::int as active_events,
          count(*)::int as total_events,
          (select count(*)::int from vacancies where is_active) as active_vacancies,
          (select count(*)::int from event_annotations) as annotations,
          (select count(*)::int from annotation_jobs where status = 'pending') as pending_annotations,
          (select count(*)::int from vacancies v join events e on e.id=v.event_id
            join event_annotations a on a.vacancy_id=v.id and a.input_hash=v.input_hash
            where v.is_active and e.is_active and (e.ends_at is null or e.ends_at>now())) as annotated_active_vacancies,
          (select count(*)::int from annotation_jobs j join vacancies v on v.id=j.vacancy_id join events e on e.id=v.event_id
            where j.status='pending' and v.is_active and e.is_active and (e.ends_at is null or e.ends_at>now())
            and not exists(select 1 from event_annotations a where a.vacancy_id=v.id and a.input_hash=v.input_hash)) as eligible_pending_annotations,
          (select count(*)::int from annotation_jobs j join vacancies v on v.id=j.vacancy_id join events e on e.id=v.event_id
            where j.status='processing' and v.is_active and e.is_active) as processing_annotations,
          (select count(*)::int from annotation_jobs j join vacancies v on v.id=j.vacancy_id join events e on e.id=v.event_id
            where j.status='failed' and v.is_active and e.is_active) as failed_active_annotations
        from events
      `);
      return result.rows[0];
    },

    async refreshEventProjection(eventId) {
      const client = await pool.connect();
      try {
        await client.query("begin");
        // Several vacancies of one event can finish in parallel. Serialize the
        // projection so the last writer never drops a just-finished alternative.
        await client.query("select pg_advisory_xact_lock(hashtext($1))", [`annotation_projection:${String(eventId)}`]);
        const result = await client.query(`
          select a.annotation, a.compact_annotation, v.id as vacancy_id
          from event_annotations a
          join vacancies v on v.id = a.vacancy_id
          where a.event_id = $1 and v.is_active and a.input_hash=v.input_hash
        `, [String(eventId)]);
        if (!result.rows.length) {
          await client.query("commit");
          return;
        }
        const records = result.rows.map((row) => ({
          ...row.annotation,
          semantic: row.annotation.semantic,
          sourceFacts: row.annotation.sourceFacts,
          compact: row.compact_annotation,
        })).sort(compareAnnotationRecords);
        const best = { ...records[0].compact, alternativesCount: records.length };
        await client.query(`
          update events
          set catalog_data = jsonb_set(
                jsonb_set(catalog_data, '{annotation}', $2::jsonb, true),
                '{themes}',
                to_jsonb((array(select distinct value from jsonb_array_elements_text(
                  coalesce(catalog_data->'themes', '[]'::jsonb) || to_jsonb($3::text[])
                ) as value))[1:8]),
                true
              ),
              updated_at = now()
          where id = $1
        `, [String(eventId), JSON.stringify(best), best.themeIds || []]);
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}
