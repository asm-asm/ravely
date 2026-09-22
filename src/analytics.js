import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import { filterGroups } from '../public/filters.js';
import { redisAnalytics } from './analytics-redis.js';

export function analyticsRoutes({ env, directory }) {
  const router = express.Router();
  const file = path.resolve(env.ANALYTICS_FILE || path.join(directory, 'data/analytics.json'));
  const token = env.ANALYTICS_ADMIN_TOKEN || '';
  const enabled = env.ANALYTICS_ENABLED !== 'false';
  const redis = redisAnalytics(env);
  const storageMissing = !!env.VERCEL && !redis;
  const events = ['page_view', 'search', 'pattern_click'];
  let buckets = {};
  if (enabled && !redis && !storageMissing && fs.existsSync(file)) buckets = JSON.parse(fs.readFileSync(file, 'utf8'));
  let windowStart = Date.now(), requests = 0;
  router.post('/event', express.json({ limit: '2kb' }), async (req, res) => {
    if (!enabled) return res.sendStatus(204);
    if (storageMissing) return res.status(503).json({ error: '解析用ストレージが未設定です。' });
    if (Date.now() - windowStart > 60000) { windowStart = Date.now(); requests = 0; }
    if (++requests > 600) return res.sendStatus(429);
    const { event, filters = {} } = req.body || {};
    if (!events.includes(event) || !filters || typeof filters !== 'object' || Array.isArray(filters) ||
      Object.keys(req.body).some(key => !['event', 'filters'].includes(key)) ||
      Object.entries(filters).some(([key, value]) => !filterGroups.some(g => g.key === key && g.options.some(([v]) => v === value)))) return res.sendStatus(400);
    const today = new Date().toISOString().slice(0, 10);
    if (redis) {
      try { await redis.increment(today, event, filters); return res.sendStatus(204); }
      catch { return res.status(503).json({ error: '集計の保存に失敗しました。' }); }
    }
    const cutoff = new Date(Date.now() - 89 * 86400000).toISOString().slice(0, 10);
    const updated = Object.fromEntries(Object.entries(buckets).filter(([day]) => day >= cutoff));
    const bucket = structuredClone(updated[today] || { page_view: 0, search: 0, pattern_click: 0, tags: {} });
    bucket[event]++;
    if (event === 'search') for (const [key, value] of Object.entries(filters)) {
      const tag = `${key}:${value}`;
      bucket.tags[tag] = (bucket.tags[tag] || 0) + 1;
    }
    updated[today] = bucket;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file + '.tmp', JSON.stringify(updated), { mode: 0o600 });
      fs.renameSync(file + '.tmp', file);
      buckets = updated;
      return res.sendStatus(204);
    } catch { return res.status(503).json({ error: '集計の保存に失敗しました。' }); }
  });
  router.get('/summary', async (req, res) => {
    const local = !env.VERCEL && env.NODE_ENV !== 'production' && !token &&
      ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(req.hostname) && !req.headers['x-forwarded-for'] &&
      (!req.headers.origin || req.headers.origin === `${req.protocol}://${req.headers.host}`);
    const supplied = req.headers.authorization?.replace(/^Bearer /, '') || '';
    const valid = token && supplied && crypto.timingSafeEqual(crypto.createHash('sha256').update(token).digest(), crypto.createHash('sha256').update(supplied).digest());
    if (!local && !valid) return res.status(401).json({ error: '管理用トークンを入力してください。' });
    if (storageMissing) return res.status(503).json({ error: '解析用RedisストレージをVercelで接続してください。' });
    let current = buckets;
    if (redis) {
      try { current = await redis.read(Array.from({length:30}, (_, i) => new Date(Date.now() - (29-i)*86400000).toISOString().slice(0,10))); }
      catch { return res.status(503).json({ error: '集計を読み込めませんでした。' }); }
    }
    const days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date(Date.now() - (29 - i) * 86400000).toISOString().slice(0, 10);
      return { date, ...(current[date] || { page_view: 0, search: 0, pattern_click: 0, tags: {} }) };
    });
    const totals = { page_view: 0, search: 0, pattern_click: 0 };
    const tags = {};
    for (const day of days) {
      for (const event of events) totals[event] += day[event];
      for (const [key, count] of Object.entries(day.tags)) tags[key] = (tags[key] || 0) + count;
    }
    res.json({ enabled, timezone: 'UTC', days, totals, tags });
  });
  router.use((error, req, res, next) => res.status(400).json({ error: '無効な集計データです。' }));
  return router;
}
