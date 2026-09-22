import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.js';

async function serve(t, options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return path => fetch(`http://127.0.0.1:${server.address().port}${path}`);
}
test('initial load requests six photographed patterns ordered by project count; filters restore 24', async t => {
  const calls = [];
  const request = await serve(t, { env: { RAVELRY_MODE: 'live', RAVELRY_API_USERNAME: 'test', RAVELRY_API_PASSWORD: 'test' },
    fetchImpl: async url => { calls.push(url); return Response.json({ patterns: [], paginator: { results: 0 } }); } });
  const initial = await (await request('/api/search')).json();
  assert.equal(initial.featured, true);
  assert.equal(calls[0].searchParams.get('page_size'), '6');
  assert.equal(calls[0].searchParams.get('sort'), 'projects');
  assert.equal(calls[0].searchParams.get('photo'), 'yes');
  const filtered = await (await request('/api/search?weight=dk&fit=baby&pa=seamless&page=2')).json();
  assert.equal(filtered.featured, false);
  for (const [key,value] of Object.entries({ weight: 'dk', fit: 'baby', pa: 'seamless', page: '2', page_size: '24' })) assert.equal(calls[1].searchParams.get(key), value);
  assert.equal(calls[1].searchParams.has('sort'), false);
  for (const query of ['weight=bad', 'fit=child&fit=adult', 'pa=unknown']) assert.equal((await request('/api/search?' + query)).status, 400);
  assert.equal(calls.length, 2);
});
test('demo combines new criteria without pretending unsupported matches', async t => {
  const request = await serve(t, { env: {} });
  assert.equal((await (await request('/api/search?weight=dk&fit=adult&pa=lace')).json()).total, 1);
  assert.equal((await (await request('/api/search?weight=dk&fit=baby')).json()).total, 0);
});
