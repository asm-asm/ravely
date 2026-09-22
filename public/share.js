export async function sharePage(navigator, data) {
  if (typeof navigator.share === 'function') {
    try { await navigator.share(data); return 'shared'; }
    catch (error) { if (error.name === 'AbortError') return 'cancelled'; }
  }
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(data.url); return 'copied'; }
    catch { /* Fall back to a selectable URL. */ }
  }
  return 'manual';
}

if (typeof document !== 'undefined') {
  const button = document.getElementById('shareSite');
  const status = document.getElementById('shareStatus');
  const fallback = document.getElementById('shareFallback');
  button.addEventListener('click', async () => {
    const url = new URL(document.querySelector('link[rel="canonical"]')?.href || location.href);
    url.search = '';
    url.hash = '';
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const localNote = local ? ' このURLはこのPC内での確認用です。外部への共有には公開URLが必要です。' : '';
    button.disabled = true;
    status.textContent = '';
    fallback.hidden = true;
    try {
      const result = await sharePage(navigator, { title: 'Ravelry 日本語検索', text: '日本語やタグで、編みたいパターンを見つけよう。', url: url.href });
      if (result === 'shared') status.textContent = '共有しました。' + localNote;
      if (result === 'copied') status.textContent = 'サイトのURLをコピーしました。' + localNote;
      if (result === 'manual') {
        status.textContent = 'URLをコピーして共有できます。' + localNote;
        fallback.hidden = false;
        const input = document.getElementById('shareUrl');
        input.value = url.href;
        input.focus();
        input.select();
      }
    } finally { button.disabled = false; }
  });
}
