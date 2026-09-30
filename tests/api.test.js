import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import path from 'node:path';
import { checkDemoApi } from './helpers/demo-api.mjs';
import http from 'node:http';
import { handleRecSys } from '../server/recsys-service.js';

const database=process.env.TEST_DATABASE_URL;
if(database && !new URL(database).pathname.includes('test')) throw new Error('TEST_DATABASE_URL must point to an isolated test database');
test('PostgreSQL API: complete demo journey, ownership, idempotency, intro and restart',{skip:!database},async t=>{
  const port=33000+Math.floor(Math.random()*2000),base=`http://127.0.0.1:${port}`;
  const recsysService = http.createServer(handleRecSys);
  await new Promise(resolve => recsysService.listen(0, '127.0.0.1', resolve));
  const recsysUrl = `http://127.0.0.1:${recsysService.address().port}`;
  t.after(async () => { await new Promise(resolve => recsysService.close(resolve)); });
  let child,output='';
  async function start() {
    child=spawn(process.execPath,['server/index.js'],{cwd:path.resolve(import.meta.dirname,'..'),
      env:{...process.env,PORT:String(port),HOST:'127.0.0.1',DATABASE_URL:database,DB_SCHEMA:'app',
        DEMO_MODE:'true',DEMO_DATA:'true',MAX_BOT_TOKEN:'',MAX_WEBHOOK_URL:'',PRIVATE_DATA_ENCRYPTION_KEY_FILE:'',PRIVATE_DATA_ENCRYPTION_KEY:'',CATALOG_ANNOTATED_ONLY:'false',RECSYS_URL:recsysUrl},stdio:'pipe'});
    child.stdout.on('data',data=>{output+=data;});child.stderr.on('data',data=>{output+=data;});
    for(let n=0;n<150;n++) { try { if((await fetch(base+'/api/health')).ok)return; }catch{}
      if(child.exitCode!==null) throw new Error(output.slice(-1800));
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    throw Error('Server did not start');
  }
  async function stop() {
    if(!child || child.exitCode!==null)return;
    const exited=new Promise(resolve=>child.once('exit',resolve));child.kill();await exited;
  }
  t.after(stop);
  await start();
  const apiIndex=await fetch(base+'/api');
  assert.equal(apiIndex.status,200);
  assert.match(apiIndex.headers.get('content-type'),/text\/html/);
  assert.match(await apiIndex.text(),/swagger-ui-bundle\.js/);
  const apiIndexData=await (await fetch(base+'/api/index.json')).json();
  assert.equal(apiIndexData.openapi,'/api/openapi.yaml');
  assert.equal((await fetch(base+'/api/')).status,200);
  assert.equal((await fetch(base+'/api/swagger-ui/swagger-ui-bundle.js')).status,200);
  assert.equal((await fetch(base+'/api/swagger-ui/swagger-ui.css')).status,200);
  const openapi=await fetch(base+'/api/openapi.yaml');
  assert.equal(openapi.status,200);
  assert.match(await openapi.text(),/openapi: 3\.0\.3/);
  assert.equal((await fetch(base+'/api', {method:'POST'})).status,405);
  const result=await checkDemoApi(base,{restart:async()=>{await stop();await start();}});
  assert.equal(result.completed,1);assert.equal(result.calibration,6);
});
