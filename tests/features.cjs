const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function verify() {
  const root = path.resolve(__dirname, '..');
  const mime = { '.html': 'text/html', '.js': 'text/javascript', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
  const server = http.createServer(async (request, response) => {
    try {
      const file = path.resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
      if (!file.startsWith(root + path.sep)) throw new Error('Invalid path');
      response.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream');
      response.end(await fs.readFile(file));
    } catch { response.writeHead(404); response.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--mute-audio'] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, colorScheme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => {
      const realNow = Date.now;
      window.timeOffset = 0;
      Date.now = () => realNow() + window.timeOffset;
      const NativeAudioContext = window.AudioContext;
      window.AudioContext = class extends NativeAudioContext {
        constructor(...args) { super(...args); window.testAudio = this; }
        createGain() {
          const node = super.createGain();
          if (!window.testMaster) window.testMaster = node;
          return node;
        }
      };
    });
    const url = `http://127.0.0.1:${server.address().port}/harmonics.html`;
    const externalRequests = [], mediaRequests = [];
    context.on('request', request => {
      if (/^https?:/.test(request.url()) && new URL(request.url()).origin !== new URL(url).origin) externalRequests.push(request.url());
      if (request.resourceType() === 'media') mediaRequests.push(request.url());
    });
    const state = () => page.evaluate(() => ({ S: structuredClone(Harmonics.S), P: structuredClone(Harmonics.P) }));
    const advance = ms => page.evaluate(ms => { window.timeOffset += ms; Harmonics.tickTimer(); }, ms);
    const menu = async () => { await page.locator('#menuBtn').click(); await page.waitForTimeout(400); };
    const close = async () => { await page.locator('#closeDrawer').click(); };
    await page.goto(url);
    await page.waitForFunction(() => !!window.Harmonics);
    assert.equal((await state()).S.playing, false);
    assert.equal(await page.evaluate(() => !!window.testAudio), false);
    const rendered = await page.evaluate(async () => {
      const context = new OfflineAudioContext(2, 48000, 48000);
      const voice = HarmonicsSynthesis.createVoice(context, context.destination,
        { carrier: 220, pulse: 6, mode: 'binaural', shape: 'sine', harmonicGain: 0 });
      voice.level.gain.value = .5;
      const buffer = await context.startRendering();
      const channels = [0, 1].map(channel => {
        const samples = buffer.getChannelData(channel);
        let energy = 0, crossings = 0;
        for (let i = 1; i < samples.length; i++) {
          energy += samples[i] * samples[i];
          if (samples[i - 1] < 0 && samples[i] >= 0) crossings++;
        }
        return { rms: Math.sqrt(energy / samples.length), crossings };
      });
      voice.dispose(); return channels;
    });
    assert.ok(rendered.every(channel => channel.rms > .3 && channel.rms < .4), 'Real rendered stereo audio is non-silent');
    assert.ok(Math.abs(rendered[0].crossings - 217) <= 1 && Math.abs(rendered[1].crossings - 223) <= 1, 'Each ear receives the correct tone');
    assert.equal(await page.locator('#cycleTime').textContent(), '25:00');
    await menu();
    await page.locator('#studyMinutes').fill('1');
    await page.locator('#breakMinutes').fill('1');
    await page.locator('#studyRounds').fill('2');
    await page.locator('#fadeSeconds').fill('2');
    await page.locator('#fadeSeconds').blur();
    await close();
    await page.locator('#cycleToggle').click();
    await page.waitForFunction(() => testAudio.state === 'running');
    assert.equal((await state()).P.status, 'running');
    await advance(15000);
    await page.locator('#playBtn').click();
    const remaining = (await state()).P.remaining;
    await advance(10000);
    assert.equal((await state()).P.remaining, remaining, 'Pausing freezes the timer');
    await page.keyboard.press('Space');
    assert.equal((await state()).P.status, 'running');
    await advance(remaining + 10);
    assert.equal((await state()).P.phase, 'break');
    await page.waitForTimeout(160);
    assert.ok(await page.evaluate(() => testMaster.gain.value < .001), 'Break is silent');
    assert.equal((await state()).S.playing, true, 'Automatic break keeps session active');
    await advance(60010);
    assert.equal((await state()).P.phase, 'study');
    assert.equal((await state()).P.round, 2);
    await page.waitForTimeout(160);
    assert.ok(await page.evaluate(() => testMaster.gain.value > .5), 'Next study round restores volume');
    await advance(60010);
    assert.equal((await state()).P.status, 'complete');
    assert.equal((await state()).S.playing, false);
    await page.locator('#cycleReset').click();
    await menu();
    await page.locator('#autoContinue').uncheck();
    await close();
    await page.locator('#cycleToggle').click();
    await advance(60010);
    assert.equal((await state()).P.phase, 'break');
    assert.equal((await state()).P.status, 'paused');
    assert.equal((await state()).S.playing, false);
    await page.locator('#cycleToggle').click();
    await advance(60010);
    assert.equal((await state()).P.phase, 'study');
    assert.equal((await state()).P.status, 'paused');
    await page.locator('#cycleReset').click();

    // Check the real audio clock, not only the displayed countdown.
    await page.locator('#playBtn').click();
    await page.waitForFunction(() => testAudio.state === 'running');
    await page.evaluate(() => Harmonics.setTimer(.05));
    await page.waitForTimeout(1700);
    const fading = await page.evaluate(() => testMaster.gain.value);
    assert.ok(fading > .15 && fading < .55, `Expected intermediate fading gain, got ${fading}`);
    await page.evaluate(() => { Harmonics.resetCycle(false); Harmonics.setTimer(0); });
    await page.waitForTimeout(1600);
    assert.equal((await state()).S.playing, true, 'Cancelled timer cannot stop a later session');
    await page.evaluate(() => Harmonics.setTimer(.02));
    await page.waitForTimeout(1900);
    assert.equal((await state()).S.playing, false, 'Sleep timer stops playback');
    assert.equal((await state()).S.timerMin, 0);
    await page.evaluate(() => Harmonics.setTimer(5));
    const sleepRemaining = (await state()).S.timerRemaining;
    await advance(60000);
    assert.equal((await state()).S.timerRemaining, sleepRemaining);
    await page.locator('#cycleToggle').click();
    assert.equal((await state()).S.timerMin, 0, 'Study cancels sleep timer');
    await page.evaluate(() => Harmonics.setTimer(5));
    assert.equal((await state()).P.status, 'idle', 'Sleep cancels study timer');
    await page.evaluate(() => { Harmonics.setTimer(0); Harmonics.togglePlay(); });

    await menu();
    await page.locator('#autoContinue').check();
    await page.locator('#studyMinutes').fill('0');
    await page.locator('#studyMinutes').blur();
    assert.equal(await page.locator('#studyMinutes').inputValue(), '1');
    const beforeVisuals = (await state()).S;
    for (const [id, value] of [['visualBrightness', '55'], ['visualThickness', '2.1'], ['visualSpeed', '0']]) {
      await page.locator('#' + id).fill(value);
    }
    const afterVisuals = (await state()).S;
    assert.deepEqual(afterVisuals.level, beforeVisuals.level);
    for (const key of ['tuning', 'octave', 'mode', 'timbre', 'noise', 'volume']) assert.equal(afterVisuals[key], beforeVisuals[key]);
    assert.equal(afterVisuals.visualBrightness, .55);
    assert.equal(afterVisuals.visualThickness, 2.1);
    await close();
    await page.locator('#playBtn').click();
    await page.waitForTimeout(1600);
    const frozen = await page.locator('#viz').evaluate(el => el.toDataURL());
    await page.waitForTimeout(150);
    assert.equal(await page.locator('#viz').evaluate(el => el.toDataURL()), frozen);
    assert.equal((await state()).S.playing, true);
    await page.locator('#expandView').click();
    await page.waitForTimeout(750);
    assert.equal(await page.locator('#viz').evaluate(el => getComputedStyle(el).opacity), '0.55');
    await page.locator('#zenExit').click();
    await page.waitForTimeout(750);
    assert.equal(await page.locator('#viz').evaluate(el => getComputedStyle(el).opacity), '0.55');
    await page.locator('#playBtn').click();

    assert.equal(await page.locator('#mixList, #saveMixForm, #draftRecovery, #renameDialog').count(), 0);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    await context.setOffline(true);
    await page.reload();
    await page.waitForFunction(() => !!window.Harmonics);
    await page.locator('#cycleToggle').click();
    assert.equal((await state()).S.playing, true);
    await page.locator('#cycleReset').click();
    await context.setOffline(false);

    for (const width of [1920, 1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 1100 });
      await page.waitForTimeout(200);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `No overflow at ${width}`);
      assert.ok(await page.locator('#viz').evaluate(el => {
        const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
        let count = 0; for (let i = 3; i < data.length; i += 4) if (data[i] > 10) count++;
        return count > 500;
      }), `Nonblank canvas at ${width}`);
      await page.screenshot({ path: path.join(os.tmpdir(), `harmonics-features-${width}.png`), fullPage: true });
      await menu();
      assert.ok(await page.locator('#drawer').evaluate(el => el.scrollWidth <= el.clientWidth + 1));
      if (width === 390) await page.screenshot({ path: path.join(os.tmpdir(), 'harmonics-features-settings.png') });
      await close();
    }
    const blocked = await browser.newPage();
    await blocked.addInitScript(() => {
      Storage.prototype.getItem = () => { throw new Error('Storage disabled'); };
      Storage.prototype.setItem = () => { throw new Error('Storage disabled'); };
    });
    await blocked.goto(url);
    await blocked.waitForFunction(() => !!window.Harmonics);
    await blocked.locator('#playBtn').click();
    assert.equal(await blocked.evaluate(() => Harmonics.S.playing), true);
    await blocked.locator('#playBtn').click();
    await blocked.close();
    const fallback = await browser.newPage();
    await fallback.addInitScript(() => { AudioParam.prototype.cancelAndHoldAtTime = undefined; });
    await fallback.goto(url);
    await fallback.locator('#cycleToggle').click();
    assert.equal(await fallback.evaluate(() => Harmonics.P.status), 'running');
    await fallback.locator('#cycleToggle').click();
    assert.equal(await fallback.evaluate(() => Harmonics.P.status), 'paused');
    await fallback.close();
    assert.deepEqual(errors, []);
    assert.deepEqual(externalRequests, [], 'Playback must not contact third-party servers');
    assert.deepEqual(mediaRequests, [], 'Audio must be generated locally, not downloaded');
    await require('./ux.cjs')(browser, url);
    await require('./sharing.cjs')(browser, url);
    console.log('PASS: timers, fades, independent visuals, offline playback, blocked storage, removal of My mixes, and responsive nonblank canvases at 320-1920px.');
  } finally {
    if (browser) await browser.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

module.exports = verify;
if (require.main === module) verify().catch(error => { console.error(error); process.exitCode = 1; });
