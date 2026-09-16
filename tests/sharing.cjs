const assert = require('node:assert/strict');

module.exports = async function verifySharing(browser, url) {
  const canonical = 'https://mryoshq.github.io/313/';
  for (const mode of ['native', 'cancel', 'clipboard', 'denied', 'manual']) {
    const context = await browser.newContext({ viewport: { width: 320, height: 740 } });
    try {
      await context.addInitScript(mode => {
        window.shareCalls = [];
        window.copiedLinks = [];
        Object.defineProperty(navigator, 'share', { configurable: true, value: ['native', 'cancel', 'denied'].includes(mode)
          ? async data => {
            window.shareCalls.push(data);
            if (mode !== 'native') throw new DOMException('Test', mode === 'cancel' ? 'AbortError' : 'NotAllowedError');
          } : undefined });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: {
          writeText: async text => {
            if (mode === 'manual') throw new DOMException('Test', 'NotAllowedError');
            window.copiedLinks.push(text);
          }
        } });
      }, mode);
      const page = await context.newPage();
      await page.goto(url + '?campaign=ignored#private-settings');
      const before = await page.evaluate(() => JSON.stringify(Harmonics.S));
      await page.locator('#shareApp').click();
      if (mode === 'native' || mode === 'cancel') {
        assert.deepEqual(await page.evaluate(() => shareCalls), [{ title: 'Harmonics by 313', url: canonical }]);
        assert.deepEqual(await page.evaluate(() => copiedLinks), []);
        assert.equal(await page.locator('#shareDialog').isVisible(), false);
      } else if (mode === 'manual') {
        await page.locator('#shareDialog').waitFor({ state: 'visible' });
        assert.equal(await page.locator('#shareUrl').inputValue(), canonical);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'shareUrl');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.keyboard.press('Escape');
        assert.equal(await page.locator('#shareDialog').isVisible(), false);
        assert.equal(await page.evaluate(() => document.activeElement.id), 'shareApp');
      } else {
        await page.waitForFunction(() => document.getElementById('shareStatus').textContent === 'Link copied');
        assert.deepEqual(await page.evaluate(() => copiedLinks), [canonical]);
      }
      assert.equal(await page.evaluate(() => JSON.stringify(Harmonics.S)), before, 'Sharing must not change or start audio');
    } finally { await context.close(); }
  }
  const context = await browser.newContext({ javaScriptEnabled: false });
  try {
    const page = await context.newPage();
    await page.goto(new URL('index.html', url).href);
    assert.equal(await page.locator('h1').textContent(), 'Harmonics by 313');
    assert.equal(await page.locator('link[rel=canonical]').getAttribute('href'), canonical);
    assert.equal(await page.locator('noscript').isVisible(), true);
    assert.equal(await page.locator('meta[property="og:image"]').getAttribute('content'), canonical + 'social-preview.png');
  } finally { await context.close(); }
  console.log('PASS: native share, cancellation, copy fallback, blocked clipboard, clean URLs, unchanged audio, and no-JavaScript metadata.');
};
