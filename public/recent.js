import { track } from './analytics.js';
import { icon } from './icons.js';

const PAGE_SIZE = 3;
const listEl = document.getElementById('recentList');
const statusEl = document.getElementById('recentStatus');
const moreButton = document.getElementById('recentMore');

// State for the "new on Ravelry" section: patterns, loading, error, hasNext.
const state = { patterns: [], page: 0, loading: false, error: '', hasNext: false };

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}
function safeUrl(value, ravelryOnly = false) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && (!ravelryOnly || url.hostname === 'www.ravelry.com') ? url.href : null;
  } catch { return null; }
}
function placeholder() {
  const node = element('div', 'recent-image image-placeholder');
  node.append(icon('image'), element('span', '', '画像なし'));
  return node;
}
function createCard(pattern) {
  const url = safeUrl(pattern.url, true);
  const card = element(url ? 'a' : 'div', 'recent-card');
  if (url) {
    card.href = url;
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.addEventListener('click', () => track('pattern_click'));
  }
  const photo = safeUrl(pattern.photo);
  if (photo) {
    const img = element('img', 'recent-image');
    img.src = photo;
    img.alt = pattern.name || '編み図';
    img.loading = 'lazy';
    img.addEventListener('error', () => img.replaceWith(placeholder()), { once: true });
    card.append(img);
  } else card.append(placeholder());
  const body = element('div', 'recent-body');
  body.append(element('h3', '', pattern.name || 'タイトルなし'));
  if (pattern.designer) body.append(element('p', '', pattern.designer));
  if (pattern.free) body.append(element('span', 'tag', '無料'));
  card.append(body);
  return card;
}
function skeleton() {
  const card = element('div', 'recent-card recent-skeleton');
  card.setAttribute('aria-hidden', 'true');
  card.append(element('div', 'recent-image'), element('div', 'recent-body'));
  return card;
}

function render() {
  listEl.setAttribute('aria-busy', String(state.loading));
  const cards = state.patterns.map(createCard);
  if (state.loading) cards.push(...Array.from({ length: PAGE_SIZE }, skeleton));
  if (!state.loading && state.error) {
    const box = element('div', 'empty-state recent-message', state.error);
    const retry = element('button', 'recent-button', '再読み込み');
    retry.type = 'button';
    retry.addEventListener('click', () => (state.patterns.length ? loadMore() : reload()));
    box.append(retry);
    cards.push(box);
  } else if (!state.loading && !state.patterns.length) cards.push(element('div', 'empty-state recent-message', '新着の編み図はありません。'));
  listEl.replaceChildren(...cards);
  statusEl.textContent = state.loading ? '新着編み図を読み込み中…' : '';
  moreButton.hidden = !state.hasNext || Boolean(state.error);
  moreButton.disabled = state.loading;
}

async function fetchPage(page) {
  if (state.loading) return;
  state.loading = true;
  state.error = '';
  render();
  try {
    const base = window.APP_CONFIG?.API_BASE_URL || '';
    if (!base && location.hostname.endsWith('.github.io')) throw new Error('APIの接続先が未設定です。');
    const params = new URLSearchParams({ page, pageSize: PAGE_SIZE });
    const response = await fetch(`${base.replace(/\/$/, '')}/api/ravelry/recent-patterns?${params}`, { signal: AbortSignal.timeout(15000) });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('新着編み図を取得できませんでした。');
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.patterns)) throw new Error(data.error || '新着編み図を取得できませんでした。');
    // New registrations shift later pages, so skip patterns already shown.
    const seen = new Set(state.patterns.map(p => p.id));
    state.patterns.push(...data.patterns.filter(p => !seen.has(p.id)));
    state.page = page;
    state.hasNext = data.hasNext === true;
  } catch (error) {
    state.error = error.name === 'TimeoutError' ? '応答に時間がかかっています。' : error.message;
  } finally {
    state.loading = false;
    render();
  }
}

export const loadMore = () => fetchPage(state.page + 1);
export function reload() {
  if (state.loading) return;
  Object.assign(state, { patterns: [], page: 0, hasNext: false });
  return fetchPage(1);
}

moreButton.addEventListener('click', loadMore);
reload();
