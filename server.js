import express from 'express';
import cors from 'cors';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { searchPatterns, normalizeQuery, translateQuery, ApiError } from './src/ravelry.js';
import { mockPatterns } from './src/mock.js';
import { filterGroups } from './public/filters.js';
import { analyticsRoutes } from './src/analytics.js';

const directory = path.dirname(fileURLToPath(import.meta.url));

export function createApp({ env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('query parser', 'simple');
  const mode = env.RAVELRY_MODE || (env.NODE_ENV === 'production' ? 'live' : 'auto');
  if (!['auto', 'mock', 'live'].includes(mode)) throw new Error('Invalid RAVELRY_MODE');
  const username = env.RAVELRY_API_USERNAME?.trim();
  const password = env.RAVELRY_API_PASSWORD?.trim();
  const source = mode === 'mock' || (mode === 'auto' && !username && !password) ? 'mock' : 'ravelry';
  const origins = (env.CORS_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean);
  app.use('/api', cors({ origin: origins, methods: ['GET', 'POST'], credentials: false }));
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
  });
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', source }));
  app.use('/api/analytics', analyticsRoutes({ env, directory }));
  app.get('/admin', (_req, res) => res.sendFile(path.join(directory, 'admin/index.html')));
  app.get('/admin.js', (_req, res) => res.sendFile(path.join(directory, 'admin/app.js')));
  app.get('/api/search', async (req, res) => {
    const failure = (status, code, error) => res.status(status).json({ error, code, items: [], total: 0 });
    if (req.query.q !== undefined && typeof req.query.q !== 'string') return failure(400, 'INVALID_QUERY', '検索語を1つ指定してください。');
    const query = normalizeQuery(req.query.q || '');
    const filters = {};
    for (const group of filterGroups) {
      const value = req.query[group.key];
      if (value === undefined || value === '') continue;
      if (typeof value !== 'string' || !group.options.some(([key]) => key === value)) return failure(400, 'INVALID_FILTER', '指定されたタグは利用できません。');
      filters[group.key] = value;
    }
    if (query.length > 200) return failure(400, 'INVALID_QUERY', '検索語は200文字以内にしてください。');
    const pageValue = req.query.page ?? '1';
    if (typeof pageValue !== 'string' || !/^[1-9]\d{0,3}$/.test(pageValue)) return failure(400, 'INVALID_PAGE', 'ページは1〜9999の整数で指定してください。');
    const page = Number(pageValue);
    const featured = !query && !Object.keys(filters).length;
    const pageSize = featured ? 6 : 24;
    const searchQuery = translateQuery(query);
    const metadata = { query, searchQuery, page, pageSize, source, filters, featured };
    if (source === 'mock') {
      const terms = searchQuery.toLowerCase().split(' ');
      const matches = mockPatterns.filter(item => terms.every(term => item.keywords.includes(term)) &&
        (!filters.category || item.category === filters.category) && (!filters.craft || item.craft === filters.craft) &&
        (!filters.language || item.languages.some(l => l.code === filters.language)) && (!filters.availability || item.free === true) &&
        (!filters.weight || item.weight === filters.weight) && (!filters.fit || item.fit?.includes(filters.fit)) &&
        (!filters.pa || item.attributes?.includes(filters.pa)));
      return res.json({ ...metadata, total: matches.length,
        items: matches.slice((page - 1) * pageSize, page * pageSize).map(({ keywords, ...item }) => item),
        hasNext: page * pageSize < matches.length });
    }
    if (!username || !password) return failure(503, 'API_NOT_CONFIGURED', '検索APIの認証情報が未設定です。管理者による設定が必要です。');
    try {
      const upstreamFilters = featured ? { sort: 'projects', photo: 'yes' } : filters;
      return res.json({ ...metadata, ...await searchPatterns({ query: searchQuery, page, pageSize, username, password, fetchImpl, filters: upstreamFilters }) });
    } catch (error) {
      if (error instanceof ApiError) return failure(error.status, error.code, error.message);
      return failure(502, 'UPSTREAM_ERROR', 'Ravelryとの接続に失敗しました。時間をおいて再度お試しください。');
    }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'APIが見つかりません。' }));
  app.use(express.static(path.join(directory, 'public')));
  return app;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  dotenv.config();
  const port = process.env.PORT || 3000;
  createApp().listen(port, () => console.log(`Ravelry Japanese search: http://localhost:${port}`));
}
