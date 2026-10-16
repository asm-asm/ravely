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

test('recent patterns sort by creation, filter knitting by default and return only display fields', async t => {
  const request = await serve(t, { env: live, fetchImpl: async (url, options) => {
    assert.equal(url.origin + url.pathname, 'https://api.ravelry.com/patterns/search.json');
    assert.equal(url.searchParams.get('sort'), 'created');
    assert.equal(url.searchParams.get('new-to-ravelry'), 'yes');
    assert.equal(url.searchParams.get('craft'), 'knitting');
    assert.equal(url.searchParams.get('availability'), null);
    assert.equal(url.searchParams.get('page'), '1');
    assert.equal(url.searchParams.get('page_size'), '20');
    assert.equal(options.headers.Authorization, `Basic ${Buffer.from('test-user:test-secret').toString('base64')}`);
    assert.equal(options.redirect, 'error');
    return Response.json({ patterns: [
      { id: 9, name: 'New Hat', permalink: 'new-hat', designer: { name: 'Designer' }, free: true, pattern_sources: [{}],
        first_photo: { medium_url: 'http://images.example.com/hat.jpg' } },
      { id: 8, name: 'No Photo', permalink: 'no-photo', free: false },
    ], paginator: { page: 1, last_page: 3 } });
  } });
  const response = await request('/api/ravelry/recent-patterns');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'public, s-maxage=1800, stale-while-revalidate=3600');
  const data = await response.json();
  assert.deepEqual(data.patterns, [
    { id: 9, name: 'New Hat', designer: 'Designer', url: 'https://www.ravelry.com/patterns/library/new-hat', photo: 'https://images.example.com/hat.jpg', free: true },
    { id: 8, name: 'No Photo', designer: '', url: 'https://www.ravelry.com/patterns/library/no-photo', photo: null, free: false },
  ]);
  assert.equal(data.page, 1);
  assert.equal(data.hasNext, true);
  assert.ok(!JSON.stringify(data).includes('test-secret'));
});

test('recent patterns forward page, size, craft=all and free filter', async t => {
  const request = await serve(t, { env: live, fetchImpl: async url => {
    assert.equal(url.searchParams.get('craft'), null);
    assert.equal(url.searchParams.get('availability'), 'free');
    assert.equal(url.searchParams.get('page'), '3');
    assert.equal(url.searchParams.get('page_size'), '3');
    return Response.json({ patterns: [], paginator: { page: 3, last_page: 3 } });
  } });
  const data = await (await request('/api/ravelry/recent-patterns?page=3&pageSize=3&craft=all&free=1')).json();
  assert.equal(data.hasNext, false);
});

test('invalid recent-pattern queries are rejected before contacting upstream', async t => {
  const request = await serve(t, { env: live, fetchImpl: () => assert.fail('Unexpected request') });
  for (const query of ['page=0', 'page=abc', 'pageSize=0', 'pageSize=51', 'pageSize=2.5', 'craft=weaving', 'free=yes', 'page=1&page=2', 'craft=all&craft=knitting']) {
    const response = await request('/api/ravelry/recent-patterns?' + query);
    assert.equal(response.status, 400, query);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});

test('recent-pattern upstream failures map to controlled, uncached errors', async t => {
  const cases = [
    [() => new Response('', { status: 403 }), 500, 'UPSTREAM_AUTH'],
    [() => new Response('', { status: 429, headers: { 'Retry-After': '120' } }), 503, 'UPSTREAM_RATE_LIMIT'],
    [() => new Response('', { status: 500 }), 502, 'UPSTREAM_ERROR'],
    [() => { throw new DOMException('timeout', 'TimeoutError'); }, 502, 'UPSTREAM_TIMEOUT'],
    [() => Response.json({ patterns: 'invalid' }), 502, 'INVALID_UPSTREAM_RESPONSE'],
    // Unknown sort values fall back to oldest-first; never present those as new.
    [() => Response.json({ patterns: [{ id: 10 }, { id: 13 }, { id: 16 }], paginator: { last_page: 9 } }), 502, 'UPSTREAM_SORT_IGNORED'],
  ];
  const originalError = console.error;
  console.error = () => {};
  t.after(() => { console.error = originalError; });
  for (const [fetchImpl, status, code] of cases) {
    const request = await serve(t, { env: live, fetchImpl });
    const response = await request('/api/ravelry/recent-patterns');
    assert.equal(response.status, status, code);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const data = await response.json();
    assert.equal(data.code, code);
    assert.ok(!JSON.stringify(data).includes('test-secret'));
    if (status === 503) assert.equal(response.headers.get('retry-after'), '120');
  }
});

test('recent patterns require credentials in live mode and use demo data in mock mode', async t => {
  const missing = await serve(t, { env: { RAVELRY_MODE: 'live' }, fetchImpl: () => assert.fail('Unexpected request') });
  assert.equal((await missing('/api/ravelry/recent-patterns')).status, 503);
  const mock = await serve(t, { env: { RAVELRY_MODE: 'mock' }, fetchImpl: () => assert.fail('Unexpected request') });
  const data = await (await mock('/api/ravelry/recent-patterns?craft=all')).json();
  assert.equal(data.source, 'mock');
  assert.equal(data.patterns.length, 2);
  assert.deepEqual(Object.keys(data.patterns[0]).sort(), ['designer', 'free', 'id', 'name', 'photo', 'url']);
});
