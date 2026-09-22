export function redisAnalytics(env, fetchImpl = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  if (!url || !token) return null;
  const base = new URL(url);
  if (base.protocol !== 'https:') throw new Error('Redis requires HTTPS');
  const key = date => `ravely:analytics:${date}`;
  async function commands(commands, transaction = false) {
    const response = await fetchImpl(new URL(transaction ? '/multi-exec' : '/pipeline', base), {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(commands),
    });
    if (!response.ok) throw new Error('Analytics storage unavailable');
    const data = await response.json();
    if (!Array.isArray(data) || data.length !== commands.length || data.some(item => item.error)) throw new Error('Analytics storage error');
    return data.map(item => item.result);
  }
  return {
    async increment(date, event, filters) {
      const batch = [['HINCRBY', key(date), event, 1]];
      if (event === 'search') for (const [group, value] of Object.entries(filters)) batch.push(['HINCRBY', key(date), `tag:${group}:${value}`, 1]);
      batch.push(['EXPIRE', key(date), 90 * 86400]);
      await commands(batch, true);
    },
    async read(dates) {
      const rows = await commands(dates.map(date => ['HGETALL', key(date)]));
      return Object.fromEntries(dates.map((date, i) => {
        const row = rows[i] || [];
        const fields = Array.isArray(row) ? Object.fromEntries(Array.from({length: row.length / 2}, (_, j) => [row[j*2], row[j*2+1]])) : row;
        const bucket = { page_view: Number(fields.page_view || 0), search: Number(fields.search || 0), pattern_click: Number(fields.pattern_click || 0), tags: {} };
        for (const [name, count] of Object.entries(fields)) if (name.startsWith('tag:')) bucket.tags[name.slice(4)] = Number(count);
        return [date, bucket];
      }));
    },
  };
}
