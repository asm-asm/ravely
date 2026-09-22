import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../server.js';

const live = { RAVELRY_MODE: 'live', RAVELRY_API_USERNAME: 'test-user', RAVELRY_API_PASSWORD: 'test-secret' };
async function serve(t, options) {
  const server = createApp(options).listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return (path, init) => fetch(`http://127.0.0.1:${server.address().port}${path}`, init);
}

test('live search sends Basic auth and translated query, maps results and pagination', async t => {
  const request = await serve(t, { env: live, fetchImpl: async (url, options) => {
    if (url.pathname === '/patterns.json') return Response.json({ patterns: { 123: { id: 123, languages: [{ code: 'ja', name: 'Japanese' }], price: null, currency: null } } });
    assert.equal(url.origin + url.pathname, 'https://api.ravelry.com/patterns/search.json');
    assert.equal(url.searchParams.get('query'), 'baby shawl');
    assert.equal(url.searchParams.get('page'), '2');
    assert.equal(url.searchParams.get('page_size'), '24');
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('test-user:test-secret').toString('base64')}`);
    assert.equal(options.redirect, 'error');
    assert.ok(options.signal instanceof AbortSignal);
    return Response.json({ patterns: [{ id: 123, name: '<script>example</script>', permalink: 'test-shawl',
      designer: { name: 'Designer' }, free: true, first_photo: { medium_url: 'http://images.example.com/test.jpg' } }],
      paginator: { results: 60 } });
  } });
  const response = await request('/api/search?q=' + encodeURIComponent('ベビー　ｼｮｰﾙ') + '&page=2');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.source, 'ravelry');
  assert.equal(data.total, 60);
  assert.equal(data.hasNext, true);
  assert.deepEqual(data.items[0], { id: 123, title: '<script>example</script>', designer: 'Designer', type: 'Pattern',
    url: 'https://www.ravelry.com/patterns/library/test-shawl', image: 'https://images.example.com/test.jpg',
    description: 'デザイナー: Designer', tags: ['無料'], languages: [{ code: 'ja', name: 'Japanese' }], free: true, price: null, currency: null });
  assert.ok(!JSON.stringify(data).includes('test-secret'));
});

test('tag-only search forwards all facets, batches space-separated IDs and retains order', async t => {
  const calls = [];
  const request = await serve(t, { env: live, fetchImpl: async url => {
    calls.push(url);
    if (url.pathname === '/patterns/search.json') {
      assert.equal(url.searchParams.get('query'), '');
      assert.equal(url.searchParams.get('pc'), 'hat');
      assert.equal(url.searchParams.get('craft'), 'crochet');
      assert.equal(url.searchParams.get('language'), 'en');
      assert.equal(url.searchParams.get('availability'), 'free');
      assert.equal(url.searchParams.get('page'), '2');
      return Response.json({ patterns: [{ id: 22, free: true }, { id: 11, free: false }], paginator: { results: 60 } });
    }
    assert.equal(url.pathname, '/patterns.json');
    assert.equal(url.searchParams.get('ids'), '22 11');
    return Response.json({ patterns: { 11: { id: 11, price: '4.50', currency: 'USD', languages: [{ code: 'en', name: 'English' }] }, 22: { id: 22, free: true, languages: [{ code: 'ja', name: 'Japanese' }] } } });
  } });
  const response = await request('/api/search?category=hat&craft=crochet&language=en&availability=free&page=2');
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(calls.length, 2);
  assert.deepEqual(data.items.map(p => p.id), [22, 11]);
  assert.equal(data.items[1].price, 4.5);
  assert.equal(data.items[1].currency, 'USD');
  assert.equal(data.items[0].free, true);
  assert.equal(data.detailsWarning, false);
  assert.equal(data.hasNext, true);
});

test('invalid and repeated tags are rejected', async t => {
  const request = await serve(t, { env: live, fetchImpl: () => assert.fail('Unexpected request') });
  for (const query of ['category=invalid', 'language=ja&language=en', 'availability=paid', 'craft=invalid']) {
    assert.equal((await request('/api/search?' + query)).status, 400);
  }
});

test('details failure preserves search results and explicitly reports missing metadata', async t => {
  const request = await serve(t, { env: live, fetchImpl: async url => url.pathname.endsWith('/search.json')
    ? Response.json({ patterns: [{ id: 1, name: 'Example', free: false }] }) : new Response('', { status: 503 }) });
  const data = await (await request('/api/search?category=hat')).json();
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].price, null);
  assert.deepEqual(data.items[0].languages, []);
  assert.equal(data.detailsWarning, true);
});

test('demo supports combined filters and returns zero matches honestly', async t => {
  const request = await serve(t, { env: {} });
  const data = await (await request('/api/search?category=shawl-wrap&language=ja&availability=free')).json();
  assert.equal(data.items.length, 1);
  assert.equal(data.items[0].languages[0].code, 'ja');
  const empty = await (await request('/api/search?category=hat&language=ja')).json();
  assert.equal(empty.total, 0);
});

test('demo is explicit; empty query shows initial patterns and page beyond results is empty', async t => {
  const request = await serve(t, { env: {}, fetchImpl: () => assert.fail('No upstream call in demo') });
  assert.equal((await (await request('/api/search?q=shawl')).json()).source, 'mock');
  assert.equal((await (await request('/api/search?q=shawl&page=2')).json()).items.length, 0);
  const initial = await (await request('/api/search')).json();
  assert.equal(initial.total, 2);
  assert.equal(initial.featured, true);
  assert.equal(initial.pageSize, 6);
});

test('missing/partial credentials never silently enable demo in live/production', async t => {
  for (const env of [{ NODE_ENV: 'production' }, { RAVELRY_MODE: 'live' }, { RAVELRY_API_USERNAME: 'partial' }]) {
    const request = await serve(t, { env });
    assert.equal((await request('/api/search?q=hat')).status, 503);
  }
});

test('invalid queries and pages are rejected before contacting upstream', async t => {
  const request = await serve(t, { env: live, fetchImpl: () => assert.fail('Invalid input contacted upstream') });
  for (const query of ['q=a&q=b', 'q=a&page=0', 'q=a&page=-1', 'q=a&page=1.5', 'q=a&page=10000', 'q=' + 'a'.repeat(201)]) {
    assert.equal((await request('/api/search?' + query)).status, 400);
  }
});

test('upstream failures are distinguishable and never replaced by mock results', async t => {
  for (const [status, code, output] of [[401, 'UPSTREAM_AUTH', 502], [403, 'UPSTREAM_AUTH', 502], [429, 'UPSTREAM_RATE_LIMIT', 503], [500, 'UPSTREAM_ERROR', 502]]) {
    const request = await serve(t, { env: live, fetchImpl: async () => new Response('private upstream error', { status }) });
    const response = await request('/api/search?q=hat');
    assert.equal(response.status, output);
    const data = await response.json();
    assert.equal(data.code, code);
    assert.deepEqual(data.items, []);
    assert.ok(!data.error.includes('private'));
  }
});

test('timeout and invalid payload return controlled errors', async t => {
  for (const [fetchImpl, status] of [
    [async () => { throw new DOMException('timeout', 'TimeoutError'); }, 504],
    [async () => Response.json({ unexpected: [] }), 502],
    [async () => new Response('<html>bad</html>'), 502],
    [async () => { throw new Error('secret network details'); }, 502],
  ]) {
    const request = await serve(t, { env: live, fetchImpl });
    assert.equal((await request('/api/search?q=hat')).status, status);
  }
});

test('missing optional fields and unknown totals remain honest', async t => {
  const request = await serve(t, { env: live, fetchImpl: async () => Response.json({ patterns: [{ id: 1 }] }) });
  const data = await (await request('/api/search?q=hat')).json();
  assert.equal(data.total, null);
  assert.equal(data.items[0].image, null);
  assert.equal(data.items[0].url, null);
  assert.equal(data.hasNext, false);
});

test('CORS only grants configured origins; unknown APIs and secrets are not served', async t => {
  const request = await serve(t, { env: { CORS_ORIGINS: 'https://example.github.io' } });
  const allowed = await request('/api/search?q=hat', { headers: { Origin: 'https://example.github.io' } });
  assert.equal(allowed.headers.get('access-control-allow-origin'), 'https://example.github.io');
  const denied = await request('/api/search?q=hat', { headers: { Origin: 'https://evil.example' } });
  assert.equal(denied.headers.get('access-control-allow-origin'), null);
  assert.equal((await request('/api/unknown')).status, 404);
  assert.equal((await request('/.env')).status, 404);
  assert.equal((await request('/server.js')).status, 404);
  assert.equal((await request('/')).status, 200);
});
