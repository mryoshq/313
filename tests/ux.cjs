const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

module.exports = async function verifyUX(browser, url) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const legacy = { 'harmonics-mixes-v1': 'existing mixes', 'harmonics-drafts-v1': 'existing drafts' };
  await page.addInitScript(data => {
    for (const [key, value] of Object.entries(data)) localStorage.setItem(key, value);
    window.mixStorageAccess = [];
    for (const method of ['getItem', 'setItem', 'removeItem']) {
      const original = Storage.prototype[method];
      Storage.prototype[method] = function(key, ...args) {
        if (key in data) window.mixStorageAccess.push([method, key]);
        return original.call(this, key, ...args);
      };
    }
  }, legacy);
  try {
    await page.goto(url);
    await page.waitForFunction(() => !!window.Harmonics);
    assert.equal(await page.locator('#simpleMode').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#bands').isVisible(), false);
    assert.equal(await page.locator('#tunings').isVisible(), false);
    assert.equal(await page.locator('#modes').isVisible(), true);
    assert.equal(await page.evaluate(() => Harmonics.S.playing), false);
    const initial = await page.evaluate(() => structuredClone(Harmonics.S));
    await page.locator('#advancedMode').click();
    assert.equal(await page.locator('#bands').isVisible(), true);
    assert.deepEqual(await page.evaluate(() => structuredClone(Harmonics.S)), initial);
    await page.reload();
    assert.equal(await page.locator('#advancedMode').getAttribute('aria-pressed'), 'true');
    await page.locator('#simpleMode').click();
    assert.equal(await page.locator('#cycleProgress').evaluate(el => el.value), 0);
    assert.equal(await page.locator('#roundDots .complete').count(), 0);
    await page.evaluate(() => { Harmonics.P.study = 1; Harmonics.P.rest = 1; Harmonics.P.rounds = 2; });
    await page.locator('#cycleToggle').click();
    await page.evaluate(() => { Harmonics.P.end = Date.now() + 30000; Harmonics.tickTimer(); });
    const halfway = await page.locator('#cycleProgress').evaluate(el => el.value);
    assert.ok(halfway >= .49 && halfway < .52);
    await page.locator('#cycleToggle').click();
    const paused = await page.locator('#cycleProgress').evaluate(el => el.value);
    await page.waitForTimeout(650);
    assert.equal(await page.locator('#cycleProgress').evaluate(el => el.value), paused);
    await page.locator('#cycleToggle').click();
    const finishPhase = () => page.evaluate(() => { Harmonics.P.end = Date.now() - 1; Harmonics.tickTimer(); });
    await finishPhase();
    assert.equal(await page.locator('#roundDots .complete').count(), 1);
    assert.equal(await page.locator('#cyclePhase').innerText(), 'Break');
    assert.ok(await page.locator('#cycleProgress').evaluate(el => el.value < .02));
    await finishPhase(); await finishPhase();
    assert.equal(await page.locator('#roundDots .complete').count(), 2);
    assert.equal(await page.locator('#cycleProgress').evaluate(el => el.value), 1);
    await page.locator('#cycleReset').click();
    assert.equal(await page.locator('#roundDots .complete').count(), 0);
    assert.equal(await page.locator('#cycleProgress').evaluate(el => el.value), 0);

    assert.equal(await page.locator('#mixList, #saveMixForm, #draftRecovery, #renameDialog, #shareMix, #mixFile').count(), 0);
    assert.doesNotMatch(await page.locator('body').innerText(), /My mixes|Save new|Unfinished mix/);
    assert.equal(await page.locator('.preset-col').isVisible(), false);
    await page.locator('#volume').fill('31');
    await page.waitForTimeout(500);
    assert.deepEqual(await page.evaluate(() => window.mixStorageAccess), []);
    const stored = await page.evaluate(keys => Object.fromEntries(keys.map(key => [key, localStorage[key]])), Object.keys(legacy));
    assert.deepEqual(stored, legacy, 'Previously saved data must not be erased');
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
      for (const mode of ['simple', 'advanced']) {
        await page.locator('#' + mode + 'Mode').click();
        await page.waitForTimeout(200);
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${mode}: no overflow at ${width}`);
        const overflows = await page.locator('button').evaluateAll(elements => elements.filter(el => el.getClientRects().length && el.scrollWidth > el.clientWidth + 2).map(el => el.textContent));
        assert.deepEqual(overflows, [], `${mode}: button labels fit at ${width}`);
        await page.screenshot({ path: path.join(os.tmpdir(), `harmonics-ux-${mode}-${width}.png`), fullPage: true });
      }
    }
    await page.locator('#simpleMode').click();
    await page.locator('#expandView').click();
    await page.waitForTimeout(750);
    await page.locator('#zenExit').click();
    await page.waitForTimeout(750);
    assert.equal(await page.locator('#viz').evaluate(el => el.parentElement.id), 'vizSlot');
    assert.equal(await page.locator('#simpleMode').getAttribute('aria-pressed'), 'true');
    assert.deepEqual(errors, []);
    console.log('PASS: My mixes and its storage handlers removed, old data preserved, simple/advanced views, timer progress, and desktop/mobile layouts.');
  } finally { await context.close(); }
};
