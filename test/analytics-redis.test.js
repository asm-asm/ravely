import test from 'node:test';
import assert from 'node:assert/strict';
import { redisAnalytics } from '../src/analytics-redis.js';
test('Redis stores atomic aggregate increments with expiry and reads daily fields', async () => {
  const db = redisAnalytics({UPSTASH_REDIS_REST_URL:'https://example.upstash.io',UPSTASH_REDIS_REST_TOKEN:'test'}, async (url, init) => {
    const commands = JSON.parse(init.body);
    if (url.pathname === '/multi-exec') {
      assert.deepEqual(commands, [['HINCRBY','ravely:analytics:2026-09-22','search',1],['HINCRBY','ravely:analytics:2026-09-22','tag:language:ja',1],['EXPIRE','ravely:analytics:2026-09-22',7776000]]);
      return Response.json(commands.map(()=>({result:1})));
    }
    return Response.json([{result:['search','2','tag:language:ja','2']},{result:[]}]);
  });
  await db.increment('2026-09-22','search',{language:'ja'});
  const rows = await db.read(['2026-09-22','2026-09-21']);
  assert.equal(rows['2026-09-22'].search,2);
  assert.equal(rows['2026-09-22'].tags['language:ja'],2);
  assert.equal(rows['2026-09-21'].page_view,0);
});
test('Redis missing or failed configuration does not fake persisted data', async () => {
  assert.equal(redisAnalytics({}),null);
  const db=redisAnalytics({KV_REST_API_URL:'https://example.upstash.io',KV_REST_API_TOKEN:'test'},async()=>Response.json([{error:'failure'}]));
  await assert.rejects(db.increment('2026-09-22','page_view',{}));
});
