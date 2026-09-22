import test from 'node:test';
import assert from 'node:assert/strict';
import { sharePage } from '../public/share.js';
import { siteMetadata } from '../scripts/site-metadata.js';

const data = { title: 'Ravelry 日本語検索', url: 'https://example.github.io/ravely/' };
test('native sharing, cancellation and clipboard fallback', async () => {
  assert.equal(await sharePage({ share: async value => assert.deepEqual(value, data) }, data), 'shared');
  assert.equal(await sharePage({ share: async () => { throw new DOMException('', 'AbortError'); }, clipboard: { writeText: () => assert.fail('Cancellation must not copy') } }, data), 'cancelled');
  assert.equal(await sharePage({ clipboard: { writeText: async url => assert.equal(url, data.url) } }, data), 'copied');
  assert.equal(await sharePage({ share: async () => { throw new Error('Unsupported'); }, clipboard: { writeText: async () => {} } }, data), 'copied');
  assert.equal(await sharePage({ clipboard: { writeText: async () => { throw new Error('Denied'); } } }, data), 'manual');
  assert.equal(await sharePage({}, data), 'manual');
});
test('OGP URLs are static, absolute and preserve the Pages repository path', () => {
  const html = '<meta property="og:image" content="./og.png"><meta name="twitter:image" content="./og.png"><!-- PUBLIC_SITE_METADATA -->';
  const result = siteMetadata(html, 'https://example.github.io/ravely');
  assert.equal((result.match(/https:\/\/example.github.io\/ravely\/og.png/g) || []).length, 2);
  assert.ok(result.includes('rel="canonical" href="https://example.github.io/ravely/"'));
  assert.ok(result.includes('property="og:url" content="https://example.github.io/ravely/"'));
  assert.throws(() => siteMetadata(html, 'https://user:password@example.com'));
  assert.throws(() => siteMetadata(html, 'http://example.com'));
});
