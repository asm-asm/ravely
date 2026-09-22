import { mkdir, copyFile, writeFile, readFile, cp } from 'node:fs/promises';
import { siteMetadata } from './site-metadata.js';

const raw = process.env.API_BASE_URL;
if (!raw) throw new Error('API_BASE_URL must be the public HTTPS backend origin.');
const url = new URL(raw);
if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
  throw new Error('API_BASE_URL must be an HTTPS origin without credentials, path, query or fragment.');
}
const destination = new URL('../dist/', import.meta.url);
if (!process.env.SITE_URL) throw new Error('SITE_URL must be the public frontend URL, including its repository path.');
const html = siteMetadata(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'), process.env.SITE_URL);
await mkdir(destination, { recursive: true });
// Allowlist keeps server files and environment files out of the Pages artifact.
for (const name of ['app.js', 'styles.css', 'filters.js', 'share.js', 'analytics.js', 'icons.js', 'og.png']) {
  await copyFile(new URL(`../public/${name}`, import.meta.url), new URL(name, destination));
}
await cp(new URL('../public/icons/', import.meta.url), new URL('icons/', destination), { recursive: true });
await writeFile(new URL('index.html', destination), html);
await writeFile(new URL('config.js', destination), `window.APP_CONFIG = ${JSON.stringify({ API_BASE_URL: url.origin })};\n`);
await writeFile(new URL('.nojekyll', destination), '');
console.log('Pages files written to dist/');
