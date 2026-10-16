export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Small vocabulary dictionary, not a general-purpose translator.
const vocabulary = {
  '初心者向け': 'beginner', '初心者': 'beginner', 'かぎ針編み': 'crochet',
  '棒針編み': 'knitting', 'ニット帽子': 'hat', 'ニット帽': 'hat',
  'カーディガン': 'cardigan', 'セーター': 'sweater', 'プルオーバー': 'pullover',
  'ショール': 'shawl', 'マフラー': 'scarf', 'スヌード': 'cowl',
  '靴下': 'socks', 'くつした': 'socks', '帽子': 'hat', '手袋': 'gloves',
  'ミトン': 'mittens', 'ブランケット': 'blanket', 'ベスト': 'vest',
  '赤ちゃん': 'baby', 'ベビー': 'baby', 'レース': 'lace', 'ケーブル': 'cable',
};
const words = new RegExp(Object.keys(vocabulary).sort((a, b) => b.length - a.length).join('|'), 'g');
export const normalizeQuery = query => query.normalize('NFKC').replace(/\s+/g, ' ').trim();
export const translateQuery = query => normalizeQuery(query.replace(words, word => ` ${vocabulary[word]} `));

function imageUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}

export function mapPattern(pattern) {
  const designer = typeof pattern.designer?.name === 'string' ? pattern.designer.name : '';
  return {
    id: pattern.id,
    title: typeof pattern.name === 'string' ? pattern.name : 'タイトルなし',
    designer, type: 'Pattern',
    url: typeof pattern.permalink === 'string' && pattern.permalink
      ? `https://www.ravelry.com/patterns/library/${encodeURIComponent(pattern.permalink)}` : null,
    image: imageUrl(pattern.first_photo?.medium_url) || imageUrl(pattern.first_photo?.small_url),
    description: designer ? `デザイナー: ${designer}` : '詳細はRavelryでご確認ください。',
    tags: pattern.free === true ? ['無料'] : [],
    languages: Array.isArray(pattern.languages) ? pattern.languages.filter(l => typeof l?.code === 'string').map(l => ({ code: l.code, name: l.name || l.code })) : [],
    free: typeof pattern.free === 'boolean' ? pattern.free : null,
    price: pattern.price !== null && pattern.price !== undefined && String(pattern.price).trim() !== '' && Number.isFinite(Number(pattern.price)) && Number(pattern.price) >= 0 ? Number(pattern.price) : null,
    currency: typeof pattern.currency === 'string' && /^[A-Z]{3}$/.test(pattern.currency) ? pattern.currency : null,
  };
}

export async function searchPatterns({ query, page, pageSize, username, password, fetchImpl, filters = {} }) {
  // Fixed destination: credentials must never go to a client-supplied URL.
  const url = new URL('https://api.ravelry.com/patterns/search.json');
  url.search = new URLSearchParams({ query, page: String(page), page_size: String(pageSize) });
  for (const [key, value] of Object.entries(filters)) url.searchParams.set(key === 'category' ? 'pc' : key, value);
  // One deadline covers both the search and the batched details request.
  const signal = AbortSignal.timeout(12000);
  async function request(target) {
  try {
    const response = await fetchImpl(target, {
      headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` },
      signal, redirect: 'error',
    });
    if (response.status === 401 || response.status === 403) throw new ApiError(502, 'UPSTREAM_AUTH', 'Ravelryの認証に失敗しました。管理者による認証設定の確認が必要です。');
    if (response.status === 429) throw new ApiError(503, 'UPSTREAM_RATE_LIMIT', 'Ravelryの利用上限に達しました。時間をおいて再度お試しください。');
    if (!response.ok) throw new ApiError(502, 'UPSTREAM_ERROR', 'Ravelryから検索結果を取得できませんでした。');
    return await response.json();
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new ApiError(504, 'UPSTREAM_TIMEOUT', 'Ravelryの応答に時間がかかっています。再度お試しください。');
    throw error;
  }
  }
  const data = await request(url);
  if (!Array.isArray(data?.patterns) || data.patterns.some(p => !p || typeof p !== 'object')) throw new ApiError(502, 'INVALID_UPSTREAM_RESPONSE', 'Ravelryの検索結果を読み取れませんでした。');
  const total = Number.isSafeInteger(data.paginator?.results) && data.paginator.results >= 0 ? data.paginator.results : null;
  const ids = data.patterns.map(p => p.id).filter(id => Number.isSafeInteger(id) && id > 0);
  let details = {};
  let detailsWarning = false;
  if (ids.length) {
    try {
      const detailUrl = new URL('https://api.ravelry.com/patterns.json');
      // Ravelry accepts space-separated IDs (serialized as +), not encoded plus signs.
      detailUrl.search = new URLSearchParams({ ids: ids.join(' ') });
      const payload = await request(detailUrl);
      if (!payload?.patterns || typeof payload.patterns !== 'object' || Array.isArray(payload.patterns)) throw new Error('Invalid details');
      details = payload.patterns;
      detailsWarning = ids.some(id => details[id]?.id !== id);
    } catch { detailsWarning = true; }
  }
  return { items: data.patterns.map(p => mapPattern(details[p.id]?.id === p.id ? { ...p, ...details[p.id] } : p)), total, detailsWarning,
    hasNext: total === null ? data.patterns.length === pageSize : page * pageSize < total };
}

export const recentCrafts = ['knitting', 'crochet', 'all'];

export function mapRecentPattern(pattern) {
  return {
    id: pattern.id,
    name: typeof pattern.name === 'string' ? pattern.name : 'タイトルなし',
    designer: typeof pattern.designer?.name === 'string' ? pattern.designer.name : '',
    url: typeof pattern.permalink === 'string' && pattern.permalink
      ? `https://www.ravelry.com/patterns/library/${encodeURIComponent(pattern.permalink)}` : null,
    photo: imageUrl(pattern.first_photo?.medium_url) || imageUrl(pattern.first_photo?.small_url),
    free: pattern.free === true,
  };
}

// "Recent" means newest additions to Ravelry (sort=created). sort=date orders by the
// month-granular publication date, which surfaces future pre-release dates first.
// new-to-ravelry=yes is the on-site "New to Ravelry" filter (about the last two months),
// so even if the undocumented sort stops working, results stay limited to recent additions.
export async function recentPatterns({ page, pageSize, craft, free, username, password, fetchImpl }) {
  const url = new URL('https://api.ravelry.com/patterns/search.json');
  url.search = new URLSearchParams({ sort: 'created', 'new-to-ravelry': 'yes', page: String(page), page_size: String(pageSize) });
  if (craft !== 'all') url.searchParams.set('craft', craft);
  if (free) url.searchParams.set('availability', 'free');
  let response;
  try {
    response = await fetchImpl(url, {
      headers: { Accept: 'application/json', Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}` },
      signal: AbortSignal.timeout(8000), redirect: 'error',
    });
  } catch (error) {
    if (error.name === 'TimeoutError' || error.name === 'AbortError') throw new ApiError(502, 'UPSTREAM_TIMEOUT', 'Ravelryの応答に時間がかかっています。再度お試しください。');
    throw new ApiError(502, 'UPSTREAM_ERROR', 'Ravelryとの接続に失敗しました。時間をおいて再度お試しください。');
  }
  if (response.status === 401 || response.status === 403) {
    console.error(`Ravelry recent patterns: authentication rejected (HTTP ${response.status})`);
    throw new ApiError(500, 'UPSTREAM_AUTH', '新着編み図を取得できませんでした。');
  }
  if (response.status === 429) {
    const retry = Number(response.headers.get('retry-after'));
    const error = new ApiError(503, 'UPSTREAM_RATE_LIMIT', 'Ravelryの利用上限に達しました。時間をおいて再度お試しください。');
    error.retryAfter = Number.isSafeInteger(retry) && retry > 0 && retry <= 3600 ? retry : 60;
    throw error;
  }
  if (!response.ok) throw new ApiError(502, 'UPSTREAM_ERROR', 'Ravelryから新着編み図を取得できませんでした。');
  const data = await response.json().catch(() => null);
  if (!Array.isArray(data?.patterns) || data.patterns.some(p => !p || typeof p !== 'object')) throw new ApiError(502, 'INVALID_UPSTREAM_RESPONSE', 'Ravelryの応答を読み取れませんでした。');
  // sort=created is undocumented. Ravelry silently falls back to ascending IDs (oldest first)
  // for unknown sorts, so treat ascending IDs as a broken sort rather than show old patterns as new.
  const ids = data.patterns.map(p => p.id);
  if (ids.length > 1 && ids.every(Number.isSafeInteger) && ids.every((id, i) => i === 0 || id > ids[i - 1])) {
    console.error('Ravelry recent patterns: sort=created appears to be ignored (IDs returned in ascending order)');
    throw new ApiError(502, 'UPSTREAM_SORT_IGNORED', '新着編み図を取得できませんでした。');
  }
  const lastPage = data.paginator?.last_page;
  return { patterns: data.patterns.map(mapRecentPattern), page,
    hasNext: Number.isSafeInteger(lastPage) ? page < lastPage : data.patterns.length === pageSize };
}
