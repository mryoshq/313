const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

test('the app directory contains no saved third-party page or vendor bundle', () => {
  const names = fs.readdirSync(root);
  assert.ok(!names.some(name => /^binaural(?:\.html|_files)$/i.test(name)));
  const runtime = ['harmonics.html', 'synthesis.js', 'pwa.js', 'share.js', 'sw.js', 'index.html', 'manifest.webmanifest'];
  for (const file of runtime) {
    const content = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(content, /BINAURAL_files|jquery|mousetrap|getclicky/i, file);
  }
});

test('the synthesis module has no network, recorded audio, storage, or account dependencies', () => {
  const source = fs.readFileSync(path.join(root, 'synthesis.js'), 'utf8');
  assert.doesNotMatch(source, /fetch\s*\(|XMLHttpRequest|decodeAudioData|new Audio\s*\(|https?:|localStorage|document\./);
  const worker = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  assert.ok(worker.includes('"synthesis.js"'), 'Local synthesis must be cached for offline playback');
});
