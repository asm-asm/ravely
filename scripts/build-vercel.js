import { readFile, writeFile } from 'node:fs/promises';
import { siteMetadata } from './site-metadata.js';
const siteUrl = process.env.SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : '');
if (!siteUrl) throw new Error('Set SITE_URL or enable Vercel system environment variables.');
const file = new URL('../public/index.html', import.meta.url);
await writeFile(file, siteMetadata(await readFile(file, 'utf8'), siteUrl));
console.log('Vercel OGP metadata generated.');
