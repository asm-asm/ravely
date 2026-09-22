export function track(event, filters = {}) {
  if (navigator.doNotTrack === '1' || navigator.globalPrivacyControl === true) return;
  const base = window.APP_CONFIG?.API_BASE_URL || '';
  if (!base && location.hostname.endsWith('.github.io')) return;
  void fetch(`${base.replace(/\/$/, '')}/api/analytics/event`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ event, filters }), keepalive: true,
    credentials: 'omit', referrerPolicy: 'no-referrer',
  }).catch(() => {});
}
