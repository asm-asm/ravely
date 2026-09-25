import { filterGroups } from './filters.js';
import { track } from './analytics.js';
import { icon, decorateIcons } from './icons.js';
const groupIcons = { category: 'shirt', craft: 'scissors', language: 'languages', availability: 'banknote', weight: 'spool', fit: 'users', pa: 'shapes' };
const form = document.getElementById('searchForm');
const input = document.getElementById('searchInput');
const resultsEl = document.getElementById('results');
const statusEl = document.getElementById('statusText');
const previous = document.getElementById('previousPage');
const next = document.getElementById('nextPage');
let activeRequest;
let currentQuery = '';
let currentPage = 1;
const selectedFilters = {};
const clearFilters = document.getElementById('clearFilters');
const languageNames = new Intl.DisplayNames(['ja'], { type: 'language' });

function languageLabel(language) {
  if (language.code === 'u') return '図解など（文章なし）';
  try { return languageNames.of(language.code) || language.name; }
  catch { return language.name; }
}
function priceLabel(item) {
  if (item.free === true) return '無料';
  if (item.price !== null && item.price !== undefined && item.currency) {
    try { return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: item.currency, currencyDisplay: 'code' }).format(item.price); }
    catch { /* Unknown currency: retain the unknown-price label. */ }
  }
  return item.free === false ? '有料・価格不明' : '価格不明';
}

function renderFilters() {
  const container = document.getElementById('filterGroups');
  for (const group of filterGroups) {
    const fieldset = element('fieldset', 'filter-group');
    fieldset.dataset.filterGroup = group.key;
    const legend = element('legend', '', group.label);
    legend.prepend(icon(groupIcons[group.key]));
    fieldset.append(legend);
    const choices = element('div', 'filter-options');
    for (const [value, label] of group.options) {
      const button = element('button', 'filter-chip', label);
      const selectedMark = icon('check');
      selectedMark.classList.add('selected-mark');
      button.prepend(selectedMark);
      button.type = 'button';
      button.dataset.group = group.key;
      button.dataset.value = value;
      button.setAttribute('aria-pressed', 'false');
      button.addEventListener('click', () => {
        if (selectedFilters[group.key] === value) delete selectedFilters[group.key];
        else selectedFilters[group.key] = value;
        updateFilters();
        search(input.value.trim());
      });
      choices.append(button);
    }
    fieldset.append(choices);
    (group.advanced ? document.getElementById('advancedFilterGroups') : container).append(fieldset);
  }
}
function updateFilters() {
  for (const button of document.querySelectorAll('.filter-chip')) button.setAttribute('aria-pressed', String(selectedFilters[button.dataset.group] === button.dataset.value));
  clearFilters.disabled = Object.keys(selectedFilters).length === 0;
  const count = filterGroups.filter(group => group.advanced && selectedFilters[group.key]).length;
  document.getElementById('advancedCount').textContent = count ? `（${count}件選択中）` : '';
}
clearFilters.addEventListener('click', () => {
  for (const key of Object.keys(selectedFilters)) delete selectedFilters[key];
  updateFilters();
  search(input.value.trim());
});

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
function createCard(item) {
  const card = element('article', 'card');
  const placeholder = () => {
    const node = element('div', 'card-image image-placeholder');
    node.append(icon('image'), element('span', '', '画像なし'));
    return node;
  };
  const image = safeUrl(item.image);
  if (image) {
    const img = element('img', 'card-image');
    img.src = image;
    img.alt = item.title || 'パターン';
    img.loading = 'lazy';
    img.addEventListener('error', () => img.replaceWith(placeholder()), { once: true });
    card.append(img);
  } else card.append(placeholder());
  const body = element('div', 'card-body');
  body.append(element('h3', '', item.title || 'タイトルなし'), element('p', '', item.description));
  const price = element('p', 'pattern-price', priceLabel(item));
  price.prepend(icon('banknote'));
  const languages = element('p', 'pattern-languages', `言語: ${item.languages?.length ? item.languages.map(languageLabel).join('・') : '不明'}`);
  languages.prepend(icon('languages'));
  body.append(price, languages);
  const tags = element('div', 'tags');
  for (const tag of (item.tags || []).slice(0, 4)) tags.append(element('span', 'tag', tag));
  body.append(tags);
  const url = safeUrl(item.url, true);
  if (url) {
    const link = element('a', 'card-link', 'Ravelryで見る');
    link.append(icon('external-link'));
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.addEventListener('click', () => track('pattern_click'));
    body.append(link);
  }
  card.append(body);
  return card;
}
function renderEmpty(message) {
  resultsEl.replaceChildren(element('div', 'empty-state', message));
}
async function search(query, page = 1, { scrollToResults = false } = {}) {
  activeRequest?.abort();
  const filters = { ...selectedFilters };
  const featured = !query && !Object.keys(filters).length;
  document.getElementById('resultIcon').className = `icon icon-${featured ? 'sparkles' : 'search'}`;
  const controller = new AbortController();
  activeRequest = controller;
  const timeout = setTimeout(() => controller.abort('timeout'), 20000);
  previous.disabled = next.disabled = true;
  statusEl.textContent = featured ? 'よく作られているパターンを読み込み中…' : '検索中…';
  resultsEl.setAttribute('aria-busy', 'true');
  resultsEl.replaceChildren();
  try {
    const base = window.APP_CONFIG?.API_BASE_URL || '';
    if (!base && location.hostname.endsWith('.github.io')) throw new Error('検索APIの接続先が未設定です。');
    const response = await fetch(`${base.replace(/\/$/, '')}/api/search?${new URLSearchParams({ q: query, page, ...filters })}`, { signal: controller.signal });
    if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('検索APIに接続できません。接続先の設定をご確認ください。');
    const data = await response.json();
    if (!response.ok || !Array.isArray(data.items)) throw new Error(data.error || '検索に失敗しました。');
    if (activeRequest !== controller) return;
    if (!data.featured && page === 1) track('search', filters);
    currentQuery = query;
    currentPage = page;
    const count = data.featured || data.total === null ? `${data.items.length}件表示` : `全${data.total}件`;
    const translated = data.searchQuery !== data.query ? ` / 検索語: ${data.searchQuery}` : '';
    const labels = filterGroups.flatMap(group => group.options.filter(([value]) => filters[group.key] === value).map(([, label]) => label));
    const summary = data.featured ? 'よく作られているパターン' : [data.query ? `「${data.query}」` : '', ...labels].filter(Boolean).join(' / ');
    statusEl.textContent = `${data.source === 'mock' ? 'デモデータ / ' : ''}${summary}: ${count} / ${page}ページ${translated}${data.detailsWarning ? ' / 一部の言語・価格を取得できませんでした' : ''}`;
    if (data.items.length) resultsEl.replaceChildren(...data.items.map(createCard));
    else renderEmpty(Object.keys(filters).length
      ? 'このキーワードとタグの組み合わせでは結果がありません。「タグをクリア」で条件を外すか、別のキーワードでお試しください。'
      : '該当する結果がありません。「ショール」や「帽子」など、短いキーワードでお試しください。');
    previous.disabled = page <= 1;
    next.disabled = !data.hasNext;
  } catch (error) {
    if (activeRequest !== controller) return;
    statusEl.textContent = '検索エラー';
    renderEmpty(controller.signal.aborted ? '応答に時間がかかっています。再度検索してください。' : error.message);
  } finally {
    clearTimeout(timeout);
    if (activeRequest === controller) {
      resultsEl.setAttribute('aria-busy', 'false');
      if (scrollToResults) resultsEl.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth'
      });
    }
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  const query = input.value.trim();
  input.blur();
  search(query, 1, { scrollToResults: true });
});
previous.addEventListener('click', () => search(currentQuery, currentPage - 1));
next.addEventListener('click', () => search(currentQuery, currentPage + 1));
decorateIcons();
renderFilters();
track('page_view');
search('');
