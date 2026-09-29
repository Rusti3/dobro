import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPool, runMigrations } from "../server/database.js";
import { createCatalogRepository } from "../server/catalog-repository.js";
import { runCatalogSync } from "../server/catalog-sync.js";
import { processAnnotationQueue } from "../server/annotation-worker.js";
import assert from 'node:assert/strict';

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl || !new URL(databaseUrl).pathname.includes('test')) throw new Error("An isolated TEST_DATABASE_URL with a test database name is required");

const firstPilot = JSON.parse(fs.readFileSync(new URL('../tests/fixtures/semantic-annotation.json', import.meta.url), 'utf8'));
const semantic = structuredClone(firstPilot.semantic);
semantic.evidence = [];

const eventId = "integration-test-event";
const vacancyId = "integration-test-vacancy";
const event = {
  id: eventId,
  name: firstPilot.eventTitle || "Тестовая экологическая помощь",
  description: "Тестовая вакансия для проверки импорта, очереди разметки и сохранения результата.",
  categories: firstPilot.sourceFacts.officialCategoryTitles.map((title) => ({ title })),
  tags: [],
  online: firstPilot.sourceFacts.format === "online",
  eventPeriod: {
    startDate: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    endDate: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  },
  location: { settlement: "Москва", title: "Онлайн", x: null, y: null },
};
const vacancy = {
  id: vacancyId,
  name: firstPilot.eventTitle || "Тестовая вакансия",
  description: "Тестовая задача с сохранением результата в PostgreSQL.",
  categories: event.categories,
  tasks: firstPilot.sourceFacts.structuredTasks,
  requirements: firstPilot.sourceFacts.structuredRequirements,
  conditions: firstPilot.sourceFacts.organizerConditions,
  online: event.online,
  vacancyPeriod: event.eventPeriod,
  location: event.location,
  deleted: false,
  hidden: false,
  archive: false,
};

const fakeDobro = {
  async searchCity(city) { return { city, eventIds: [eventId], vacancyIds: [vacancyId] }; },
  async event() { return event; },
  async vacancies() { return [vacancy]; },
};

const pool = createPool({ connectionString: databaseUrl, applicationName: "dobrie_dela_integration" });
const repository = createCatalogRepository(pool);
try {
  await runMigrations(pool);
  const sync = await runCatalogSync({
    pool,
    client: fakeDobro,
    cities: [{ name: "Интеграционный тест", settlement: "Москва" }],
    concurrency: 1,
  });
  // Keep the smoke test deterministic when a real worker has already queued
  // hundreds of vacancies: only the synthetic vacancy should be claimable.
  await pool.query("update annotation_jobs set available_at = now() + interval '1 day' where status = 'pending' and vacancy_id <> $1", [vacancyId]);
  await pool.query("update annotation_jobs set status='processing',attempts=3,locked_at=now(),lease_token='test-lease' where vacancy_id=$1",[vacancyId]);
  await runCatalogSync({pool,client:fakeDobro,cities:[{name:'Интеграционный тест',settlement:'Москва'}],concurrency:1});
  const untouched=(await pool.query('select status,attempts,lease_token from annotation_jobs where vacancy_id=$1',[vacancyId])).rows[0];
  assert.deepEqual(untouched,{status:'processing',attempts:3,lease_token:'test-lease'});
  await pool.query("update annotation_jobs set status='pending',attempts=0,locked_at=null where vacancy_id=$1",[vacancyId]);
  const unavailable=await processAnnotationQueue({pool,catalogRepository:repository,concurrency:1,maxJobs:1,responseClient:async()=>{throw Object.assign(new Error('test upstream unavailable'),{status:502});}});
  assert.equal(unavailable.status,'paused');
  const retry=(await pool.query('select status,attempts from annotation_jobs where vacancy_id=$1',[vacancyId])).rows[0];
  assert.deepEqual(retry,{status:'pending',attempts:0});
  await pool.query("update annotation_jobs set available_at=now() where vacancy_id=$1",[vacancyId]);
  const stale=await processAnnotationQueue({pool,catalogRepository:repository,concurrency:1,maxJobs:1,responseClient:async()=>{
    vacancy.description+=' Changed source.';
    await runCatalogSync({pool,client:fakeDobro,cities:[{name:'Интеграционный тест',settlement:'Москва'}],concurrency:1});
    return {id:'stale-response',output_text:JSON.stringify(semantic),usage:{}};
  }});
  assert.equal(stale.completed,0);
  assert.deepEqual(stale.errors,[]);
  assert.equal((await pool.query('select count(*)::int as count from event_annotations where vacancy_id=$1',[vacancyId])).rows[0].count,0);
  const queue = await processAnnotationQueue({
    pool,
    catalogRepository: repository,
    concurrency: 2,
    maxJobs: 5,
    responseClient: async () => ({ id: "integration-response", output_text: JSON.stringify(semantic), usage: {} }),
  });
  const counts = await repository.counts();
  assert.deepEqual(queue.errors,[]);
  const check = await pool.query(`
    select v.is_active, j.status as annotation_status, a.quality_status,
      (e.catalog_data->'annotation'->>'schemaVersion') as projected_schema
    from vacancies v
    left join annotation_jobs j on j.vacancy_id = v.id
    left join event_annotations a on a.vacancy_id = v.id
    left join events e on e.id = v.event_id
    where v.id = $1
  `, [vacancyId]);
  if (!check.rows[0] || check.rows[0].annotation_status !== "completed" || !check.rows[0].projected_schema)
    throw new Error(`Integration assertion failed: ${JSON.stringify(check.rows[0])}`);
  console.log(JSON.stringify({ sync, queue, counts, persisted: check.rows[0] }, null, 2));
} finally {
  await pool.query("update annotation_jobs set available_at = now() where status = 'pending'").catch(() => {});
  await pool.query("delete from events where id = $1", [eventId]).catch(() => {});
  await pool.end();
}
