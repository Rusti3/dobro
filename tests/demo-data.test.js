import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { demoCatalog, demoDataEnabled } from '../server/demo-data.js';

test('demo catalog is deterministic, covers all themes, has local images and fresh relative dates',()=>{
  const epoch='2026-09-29T12:00:00Z',catalog=demoCatalog(epoch);
  assert.equal(catalog.length,672); assert.equal(new Set(catalog.map(e=>e.id)).size,672);
  assert.equal(new Set(catalog.flatMap(e=>e.themes)).size,14);
  assert.deepEqual(catalog,demoCatalog(epoch));
  for(const event of catalog) {
    assert.ok(event.demo); assert.match(event.title,/^\[Тест\]/);
    assert.ok(Date.parse(event.endsAt)>Date.parse(epoch));
    assert.ok(fs.existsSync(new URL('../public'+event.image,import.meta.url)));
  }
  assert.throws(()=>demoDataEnabled({DEMO_MODE:'false',DEMO_DATA:'true'}),/forbidden/);
  assert.equal(demoDataEnabled({DEMO_MODE:'false',DEMO_DATA:'false'}),false);
});
