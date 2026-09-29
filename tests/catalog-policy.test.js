import test from 'node:test';
import assert from 'node:assert/strict';
import { createCatalogRepository } from '../server/catalog-repository.js';

test('annotated-only catalog excludes events without current annotated vacancies', async () => {
  const previous = process.env.CATALOG_ANNOTATED_ONLY;
  process.env.CATALOG_ANNOTATED_ONLY = 'true';
  const queries = [];
  const pool = { async query(sql, params) {
    queries.push({ sql, params });
    return { rows: queries.length === 1 ? [{ id: 'unannotated', catalog_data: { id: 'unannotated', annotation: { selectedVacancyId: 'old' } }, cities: [] }] : [] };
  } };
  try {
    assert.deepEqual(await createCatalogRepository(pool).listActive(), []);
    assert.deepEqual(queries[1].params, [true]);
    assert.match(queries[1].sql, /a\.input_hash=v\.input_hash and a\.compact_annotation is not null/);
  } finally {
    if (previous === undefined) delete process.env.CATALOG_ANNOTATED_ONLY;
    else process.env.CATALOG_ANNOTATED_ONLY = previous;
  }
});

test('non-production catalog policy preserves legacy unannotated catalog', async () => {
  const previous = process.env.CATALOG_ANNOTATED_ONLY;
  process.env.CATALOG_ANNOTATED_ONLY = 'false';
  let calls = 0;
  const pool = { async query() { return { rows: ++calls === 1 ? [{ id: 'legacy', catalog_data: { id: 'legacy' }, cities: [] }] : [] }; } };
  try { assert.equal((await createCatalogRepository(pool).listActive())[0].id, 'legacy'); }
  finally {
    if (previous === undefined) delete process.env.CATALOG_ANNOTATED_ONLY;
    else process.env.CATALOG_ANNOTATED_ONLY = previous;
  }
});
