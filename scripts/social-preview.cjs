const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');

async function generate() {
  const root = path.resolve(__dirname, '..');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, colorScheme: 'dark' });
    await page.goto(pathToFileURL(path.join(root, 'harmonics.html')).href);
    await page.waitForFunction(() => !!window.Harmonics);
    await page.evaluate(() => {
      Harmonics.S.visualThickness = 1.6;
      Harmonics.setAnimationOnly(true);
    });
    await page.waitForTimeout(900);
    const png = await page.evaluate(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1200; canvas.height = 630;
      const g = canvas.getContext('2d');
      g.fillStyle = '#08080a'; g.fillRect(0, 0, 1200, 630);
      const art = document.getElementById('viz');
      g.drawImage(art, 0, 185, 1200, 340);
      g.fillStyle = '#ececf0'; g.font = '600 64px Arial, sans-serif';
      g.fillText('Harmonics', 64, 104);
      g.fillStyle = '#d6b76b'; g.font = '500 32px Arial, sans-serif';
      g.fillText('by 313', 405, 103);
      g.fillStyle = '#a4a4ae'; g.font = '24px Arial, sans-serif';
      g.fillText('Focus. Relax. Wind down.', 64, 150);
      g.strokeStyle = '#303037'; g.lineWidth = 1;
      g.beginPath(); g.moveTo(64, 540); g.lineTo(1136, 540); g.stroke();
      g.fillStyle = '#ececf0'; g.font = '22px Arial, sans-serif';
      g.fillText('Sound generated locally. No account.', 64, 586);
      g.fillStyle = '#85cba5'; g.textAlign = 'right';
      g.fillText('mryoshq.github.io/313', 1136, 586);
      return canvas.toDataURL('image/png').split(',')[1];
    });
    fs.writeFileSync(path.join(root, 'social-preview.png'), Buffer.from(png, 'base64'));
    console.log('Generated 1200 x 630 social-preview.png from the app wave renderer.');
  } finally { await browser.close(); }
}

module.exports = generate;
if (require.main === module) generate().catch(error => { console.error(error); process.exitCode = 1; });
