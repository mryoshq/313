const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'harmonics.html'));

// Keep a real, crawlable root page without maintaining a second app source.
if (process.argv.includes('--check')) {
  if (!source.equals(fs.readFileSync(path.join(root, 'index.html')))) {
    throw new Error('Run node scripts/prepare-site.cjs to refresh index.html');
  }
} else {
  fs.writeFileSync(path.join(root, 'index.html'), source);
}

if (process.argv.includes('--stage')) {
  const destination = path.join(root, '_site');
  fs.rmSync(destination, { recursive: true, force: true });
  fs.mkdirSync(destination);
  for (const name of [
    'index.html', 'harmonics.html', 'synthesis.js', 'pwa.js', 'share.js', 'sw.js',
    'manifest.webmanifest', 'icons', 'social-preview.png', 'robots.txt', 'sitemap.xml'
  ]) fs.cpSync(path.join(root, name), path.join(destination, name), { recursive: true });
}
