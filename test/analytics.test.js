import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server.js';

test('analytics persists only aggregate counts and protects the production summary', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ravely-analytics-'));
  const file = path.join(dir, 'stats.json');
  const env = { NODE_ENV: 'production', ANALYTICS_FILE: file, ANALYTICS_ADMIN_TOKEN: 'test-only-token', RAVELRY_MODE: 'mock' };
  const servers = [];
  t.after(async () => { for (const server of servers) await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); fs.rmSync(dir, { recursive: true }); });
  async function start() {
    const server = createApp({env}).listen(0, '127.0.0.1'); servers.push(server); await once(server, 'listening');
    return (route, init) => fetch(`http://127.0.0.1:${server.address().port}${route}`, init);
  }
  const request = await start();
  const send = data => request('/api/analytics/event', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
  for (const event of ['page_view','pattern_click']) assert.equal((await send({event})).status,204);
  assert.equal((await send({event:'search',filters:{language:'ja',craft:'knitting'}})).status,204);
  assert.equal((await send({event:'search',q:'private words'})).status,400);
  assert.equal((await send({event:'search',filters:{language:'invented'}})).status,400);
  assert.equal((await request('/api/analytics/summary')).status,401);
  assert.equal((await request('/api/analytics/summary',{headers:{Authorization:'Bearer wrong'}})).status,401);
  const restarted = await start();
  const result = await (await restarted('/api/analytics/summary',{headers:{Authorization:'Bearer test-only-token'}})).json();
  assert.deepEqual(result.totals,{page_view:1,search:1,pattern_click:1});
  assert.equal(result.tags['language:ja'],1);
  assert.equal(result.days.length,30);
  const stored = fs.readFileSync(file,'utf8');
  assert.ok(!stored.includes('private words'));
  assert.ok(!stored.includes('127.0.0.1'));
  assert.equal((await request('/data/analytics.json')).status,404);
});
