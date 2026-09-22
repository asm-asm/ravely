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
