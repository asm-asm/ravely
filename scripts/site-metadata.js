export function siteMetadata(html, raw) {
  const site = new URL(raw);
  if (site.protocol !== 'https:' || site.username || site.password || site.search || site.hash) throw new Error('SITE_URL must be a public HTTPS URL without credentials, query or fragment.');
  if (!site.pathname.endsWith('/')) site.pathname += '/';
  const escape = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const image = new URL('og.png', site).href;
  return html.replaceAll('content="./og.png"', `content="${escape(image)}"`)
    .replace('<!-- PUBLIC_SITE_METADATA -->', `<link rel="canonical" href="${escape(site.href)}" />\n    <meta property="og:url" content="${escape(site.href)}" />`);
}
