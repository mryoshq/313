const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const canonical = 'https://mryoshq.github.io/313/';

test('root is a full crawlable app with one canonical URL and static social metadata', () => {
  const html = read('harmonics.html');
  assert.equal(read('index.html'), html, 'Refresh the generated root with scripts/prepare-site.cjs');
  assert.doesNotMatch(html, /http-equiv="refresh"/);
  assert.equal((html.match(/<title>/g) || []).length, 1);
  assert.equal((html.match(/rel="canonical"/g) || []).length, 1);
  assert.ok(html.includes(`<link rel="canonical" href="${canonical}">`));
  assert.ok(html.includes(`<meta property="og:url" content="${canonical}">`));
  assert.match(html, /<meta name="twitter:card" content="summary_large_image">/);
  assert.match(html, /<main class="app" id="app">/);
  assert.match(html, /<noscript>/);
  const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  assert.equal(schema.url, canonical);
  assert.equal(schema['@type'], 'WebApplication');
  assert.equal(schema.isAccessibleForFree, true);
  assert.ok(!schema.aggregateRating, 'Never invent reviews for search engines');
  assert.equal(schema.image, canonical + 'social-preview.png');
  assert.match(read('sitemap.xml'), /<loc>https:\/\/mryoshq.github.io\/313\/<\/loc>/);
  assert.ok(read('robots.txt').includes(canonical + 'sitemap.xml'));
});

test('social preview is a real 1200 x 630 PNG', () => {
  const image = fs.readFileSync(path.join(root, 'social-preview.png'));
  assert.equal(image.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
  assert.ok(image.length < 1000000, 'Keep link previews lightweight');
});

test('offline sharing and installation use the same app', () => {
  assert.ok(read('sw.js').includes('"share.js"'));
  assert.equal(JSON.parse(read('manifest.webmanifest')).start_url, './');
  assert.doesNotMatch(read('share.js'), /localStorage|sessionStorage|fetch\s*\(|XMLHttpRequest/);
});
