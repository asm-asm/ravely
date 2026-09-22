import { filterGroups } from '/filters.js';
import { icon, decorateIcons } from '/icons.js';
decorateIcons();
const labels = { page_view: 'ページ表示', search: '検索', pattern_click: 'Ravelryへのクリック' };
function node(tag, text) { const el = document.createElement(tag); el.textContent = text; return el; }
let active;
async function refresh() {
  active?.abort(); active = new AbortController();
  const controller = active;
  const message = document.getElementById('message');
  for (const id of ['totals', 'tags', 'days']) document.getElementById(id).replaceChildren();
  message.textContent = '読み込み中…';
  const token = document.getElementById('token').value.trim();
  try {
    const response = await fetch('/api/analytics/summary', { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '取得できませんでした。');
    for (const [key, label] of Object.entries(labels)) {
      const card = node('article', ''); card.className = 'card card-body';
      const heading = node('h2', label);
      heading.prepend(icon({ page_view: 'users', search: 'search', pattern_click: 'external-link' }[key]));
      card.append(heading, node('p', data.totals[key].toLocaleString() + '回'));
      document.getElementById('totals').append(card);
    }
    const tags = Object.entries(data.tags).sort((a,b) => b[1]-a[1]).slice(0,15);
    for (const [key, count] of tags) {
      const [groupKey,value] = key.split(':'); const group = filterGroups.find(g=>g.key===groupKey);
      const label = group?.options.find(([v])=>v===value)?.[1] || value;
      document.getElementById('tags').append(node('li', `${group?.label || groupKey} / ${label}：${count}回`));
    }
    if (!tags.length) document.getElementById('tags').append(node('li', 'まだデータがありません。'));
    for (const day of data.days.toReversed()) {
      const row = node('tr','');
      for (const value of [day.date, day.page_view, day.search, day.pattern_click]) row.append(node('td', String(value)));
      document.getElementById('days').append(row);
    }
    message.textContent = data.enabled ? '集計を更新しました。' : '現在、計測は無効です。';
  } catch(error) { if (active === controller) message.textContent = error.message; }
}
document.getElementById('login').addEventListener('submit', event => { event.preventDefault(); refresh(); });
refresh();
