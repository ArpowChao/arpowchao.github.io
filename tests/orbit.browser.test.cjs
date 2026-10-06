/* ORBIT_TEST_URL selects a local static server. Set NODE_PATH to a Playwright
 * installation and PLAYWRIGHT_CHROMIUM_EXECUTABLE to an installed Chromium.
 * Optional ORBIT_LAYOUT_AUDIT points to web-layout-qa/scripts/layout_audit.py;
 * its original browser audit is also run through the Node Playwright runtime.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.ORBIT_TEST_URL || 'http://127.0.0.1:4179/apps/orbit/index.html';
const artifacts = path.resolve('scratch/orbit-qa');
fs.mkdirSync(artifacts, { recursive: true });

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const errors = [], page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto(url);await page.locator('#pause').click();
    assert.equal(await page.locator('#advanced-controls').getAttribute('open'), null);
    assert.equal(await page.locator('#clear-trails').isVisible(), false);
    // Toggle prediction while a real pointer drag is still held. Space on the
    // focused checkbox changes the setting without releasing pointer capture.
    const prediction = page.locator('#prediction');
    await prediction.uncheck();
    await page.locator('#space').scrollIntoViewIfNeeded();
    const previewBox = await page.locator('#space').boundingBox();
    const previewX = previewBox.x + previewBox.width * .7;
    const previewY = previewBox.y + previewBox.height * .5;
    await page.mouse.move(previewX, previewY); await page.mouse.down();
    await page.mouse.move(previewX, previewY - 90, { steps: 4 });
    await prediction.focus();
    assert.equal(await page.locator('#launch-preview').isVisible(), true);
    const hiddenPreview = await page.locator('#space').screenshot();
    await page.keyboard.press('Space'); assert.equal(await prediction.isChecked(), true);
    const visiblePreview = await page.locator('#space').screenshot();
    assert.notDeepEqual(visiblePreview, hiddenPreview, 'launch prediction must follow its checkbox');
    await page.keyboard.press('Space'); assert.equal(await prediction.isChecked(), false);
    assert.deepEqual(await page.locator('#space').screenshot(), hiddenPreview, 'unchecking removes the preview immediately');
    await page.mouse.up();
    assert.equal(await page.locator('#body-count').textContent(), '1 顆');
    const hiddenOrbit = await page.locator('#space').screenshot();
    await prediction.check();
    assert.notDeepEqual(await page.locator('#space').screenshot(), hiddenOrbit, 'created orbit prediction is independently visible');
    await prediction.uncheck();
    assert.deepEqual(await page.locator('#space').screenshot(), hiddenOrbit, 'paused orbit prediction disappears immediately');
    await page.locator('#clear').click(); await prediction.check();
    const drag = async (length, xFactor = .7) => {
      await page.locator('#space').scrollIntoViewIfNeeded();
      const box = await page.locator('#space').boundingBox();
      const x = box.x + box.width * xFactor, y = box.y + box.height * .5;
      await page.mouse.move(x, y);await page.mouse.down();
      await page.mouse.move(x, y - length, { steps: 4 });
      assert.equal(await page.locator('#launch-preview').isVisible(), true);
      await page.mouse.up();
      return { x: x - box.x, y: y - box.y };
    };
    await drag(30);assert.match(await page.locator('#read-speed').textContent(), /1\.000/);
    const firstRadius = await page.locator('#read-radius').textContent();
    await drag(60);assert.match(await page.locator('#read-speed').textContent(), /2\.000/);
    assert.equal(await page.locator('#read-radius').textContent(), firstRadius);
    assert.equal(await page.locator('#body-count').textContent(), '2 顆');
    const pausedClock = await page.locator('#clock').textContent();
    await page.waitForTimeout(200);assert.equal(await page.locator('#clock').textContent(), pausedClock);
    const radius = await page.locator('#read-radius').textContent();
    assert.equal(await page.locator('#measurement-grid').isChecked(), true);
    assert.match(await page.locator('#grid-scale').textContent(), /1 R⊕ = 6,371 km/);
    await page.locator('#measurement-grid').uncheck();assert.equal(await page.locator('#grid-scale').isVisible(), false);
    assert.equal(await page.locator('#read-radius').textContent(), radius);
    await page.locator('#measurement-grid').check();assert.equal(await page.locator('#grid-scale').isVisible(), true);
    await page.locator('#zoom-out').click();assert.equal(await page.locator('#read-radius').textContent(), radius);
    assert.match(await page.locator('#grid-scale').textContent(), /2 R⊕ = 12,742 km/);
    await page.locator('#zoom-reset').click();
    assert.match(await page.locator('#grid-scale').textContent(), /1 R⊕ = 6,371 km/);
    await page.locator('#clear').click();assert.equal(await page.locator('#body-count').textContent(), '0 顆');
    // A moderate gesture should allow a bound orbit; a deliberately long
    // gesture can still escape, without clamping the launch speed or gravity.
    await drag(90);assert.equal(await page.locator('#body-kind').textContent(), '橢圓軌道');
    await drag(180);assert.equal(await page.locator('#body-kind').textContent(), '雙曲線');
    await page.locator('#clear').click();
    await page.keyboard.press('Tab');
    const box = await page.locator('#space').boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    assert.equal(await page.locator('#body-count').textContent(), '0 顆');
    assert.match(await page.locator('#message').textContent(), /以外/);
    await page.mouse.move(box.x + box.width * .7, box.y + box.height / 2);await page.mouse.down();
    await page.mouse.move(box.x + box.width * .7, box.y + box.height / 2 - 30);
    await page.keyboard.press('Escape');await page.mouse.up();
    assert.equal(await page.locator('#body-count').textContent(), '0 顆');
    await page.locator('#space').focus();await page.keyboard.press('Enter');
    for (let k = 0; k < 8; k++) await page.keyboard.press('Shift+ArrowUp');
    await page.keyboard.press('Enter');assert.match(await page.locator('#read-speed').textContent(), /2\.000/);
    await page.locator('#clear').click();
    for (const kind of ['circle', 'ellipse', 'parabola', 'hyperbola']) await page.locator(`[data-preset=${kind}]`).click();
    assert.equal(await page.locator('#body-count').textContent(), '4 顆');
    await page.locator('#body-select').selectOption({ index: 0 });
    assert.equal(await page.locator('#body-kind').textContent(), '圓軌道');
    assert.match(await page.locator('#read-semimajor').textContent(), /21,661 km/);
    assert.equal(await page.locator('#read-semimajor-earth').textContent(), '3.400 R⊕');
    await page.locator('#body-select').selectOption({ index: 1 });
    assert.equal(await page.locator('#read-periapsis').textContent(), '10,194 km');
    assert.equal(await page.locator('#read-apoapsis').textContent(), '21,661 km');
    // The theoretical radius is 15,927.5 km; floating-point evaluation may
    // put it on either side of the half-kilometre rounding boundary.
    const displayedA = Number((await page.locator('#read-semimajor').textContent()).replace(/[^\d]/g, ''));
    assert.ok(Math.abs(displayedA - 15927.5) <= .500001);
    assert.equal(await page.locator('#read-semimajor-earth').textContent(), '2.500 R⊕');
    await page.locator('#body-select').selectOption({ index: 3 });
    assert.equal(await page.locator('#read-semimajor').textContent(), '不適用');
    await page.locator('#body-select').selectOption({ index: 0 });
    await page.locator('#pause').click();await page.waitForTimeout(1500);await page.locator('#pause').click();
    assert.notEqual(await page.locator('#clock').textContent(), '模擬時間 00:00:00');
    const beforeTrail = await page.locator('#space').screenshot();
    const beforeClear = await page.locator('#read-radius').textContent();
    const beforeClearTime = await page.locator('#clock').textContent();
    await page.locator('#advanced-controls > summary').click();
    await page.locator('#clear-trails').click();
    assert.equal(await page.locator('#body-count').textContent(), '4 顆');
    assert.equal(await page.locator('#read-radius').textContent(), beforeClear);
    assert.equal(await page.locator('#clock').textContent(), beforeClearTime);
    assert.notDeepEqual(await page.locator('#space').screenshot(), beforeTrail);
    await page.locator('#trail-length').selectOption('240');
    assert.equal(await page.locator('#read-radius').textContent(), beforeClear);
    await page.locator('#body-size').selectOption('7');
    await page.locator('#body-color-choice').selectOption('#7454ba');
    const launchPoint = await drag(120);
    assert.equal(await page.locator('#body-count').textContent(), '5 顆');
    assert.equal(await page.locator('#body-color').evaluate(el => getComputedStyle(el).backgroundColor), 'rgb(116, 84, 186)');
    // A solid marker five CSS pixels from its centre distinguishes the chosen
    // large appearance from the default radius of four, without changing r.
    const markerPixel = await page.locator('#space').evaluate((el, p) => {
      const dpr = el.width / el.getBoundingClientRect().width;
      return [...el.getContext('2d').getImageData(Math.round((p.x + 5) * dpr), Math.round(p.y * dpr), 1, 1).data];
    }, launchPoint);
    assert.deepEqual(markerPixel, [116, 84, 186, 255]);
    await page.locator('#remove-body').click();
    await page.locator('#trail-length').selectOption('2400');
    await page.locator('#body-size').selectOption('4');
    await page.locator('#body-color-choice').selectOption('auto');
    await page.locator('#advanced-controls > summary').click();
    await page.locator('#body-select').selectOption({ index: 0 });
    await page.locator('.topbar').scrollIntoViewIfNeeded();
    await page.screenshot({ path: path.join(artifacts, 'desktop.png'), fullPage: false });
    await page.locator('#remove-body').click();assert.equal(await page.locator('#body-count').textContent(), '3 顆');
    await page.locator('#clear').click();
    // Zero-speed click must physically fall and stop at the surface.
    await page.mouse.click(box.x + box.width / 2 + box.height / 14 * 1.2, box.y + box.height / 2);
    await page.locator('#time-rate').fill('4');await page.locator('#pause').click();
    await page.waitForFunction(() => document.getElementById('body-status').textContent === '已撞擊');
    assert.match(await page.locator('#read-radius').textContent(), /6,371/);
    await page.locator('#pause').click();
    await page.locator('#advanced-controls > summary').click();

    const auditSource = process.env.ORBIT_LAYOUT_AUDIT ? fs.readFileSync(process.env.ORBIT_LAYOUT_AUDIT, 'utf8').match(/AUDIT_JS = r"""([\s\S]*?)"""/)[1] : null;
    const reports = [];
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 950 });await page.waitForTimeout(80);
      if (auditSource) {
        const report = await page.evaluate(new Function(`return (${auditSource})`)(), { targetSelector: 'main', textSelectors: ['.intro', '.presets .panel-copy', '#orbit-explanation', '.principle-intro > p:last-child', '.equation p'], minTextWidth: 96 });
        assert.deepEqual(report.failures, [], `${width}: ${JSON.stringify(report)}`);reports.push({ width, ...report });
      }
      const geometry = await page.evaluate(() => ({
        width: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth,
        grid: document.querySelector('.lab-layout').children.length,
        presets: document.querySelector('.preset-grid').children.length,
        canvas: document.getElementById('space').getBoundingClientRect().width,
        badControls: [...document.querySelectorAll('button, input, select')].filter(el => {
          if (!el.getClientRects().length) return false;
          const r = el.getBoundingClientRect();return r.left < 0 || r.right > innerWidth + 1;
        }).length
      }));
      assert.ok(geometry.scroll <= geometry.width + 1, JSON.stringify(geometry));
      assert.equal(geometry.grid, 2);assert.equal(geometry.presets, 4);assert.equal(geometry.badControls, 0);
      assert.ok(geometry.canvas > 270);
      const overlap = await page.evaluate(() => {
        const title = document.querySelector('.wordmark').getBoundingClientRect();
        const intro = document.querySelector('.intro').getBoundingClientRect();
        return Math.min(title.right, intro.right) > Math.max(title.left, intro.left) &&
          Math.min(title.bottom, intro.bottom) > Math.max(title.top, intro.top);
      });
      assert.equal(overlap, false, `${width}: wordmark overlaps introductory text`);
      await page.locator('.topbar').scrollIntoViewIfNeeded();
      await page.screenshot({ path: path.join(artifacts, `layout-${width}.png`), fullPage: false });
    }
    // 200% desktop zoom is represented by half the CSS viewport width.
    await page.setViewportSize({ width: 720, height: 500 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.locator('#clear').click();await page.locator('[data-preset=circle]').click();
    assert.equal(await page.locator('#body-kind').textContent(), '圓軌道');
    await page.locator('#advanced-controls > summary').click();

    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    const phone = await touch.newPage();phone.on('pageerror', e => errors.push(e.message));
    await phone.goto(url);await phone.locator('#pause').click();
    const touchBox = await phone.locator('#space').boundingBox();
    const session = await touch.newCDPSession(phone);
    const x = touchBox.x + touchBox.width * .78, y = touchBox.y + touchBox.height * .5;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y - 45 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal(await phone.locator('#body-count').textContent(), '1 顆');
    assert.match(await phone.locator('#read-speed').textContent(), /1\.500/);
    await phone.locator('[data-preset=ellipse]').click();
    await phone.locator('.topbar').scrollIntoViewIfNeeded();
    await phone.screenshot({ path: path.join(artifacts, 'mobile.png'), fullPage: false });
    await touch.close();
    fs.writeFileSync(path.join(artifacts, 'layout-report.json'), JSON.stringify(reports, null, 2));
    assert.deepEqual(errors, []);
    console.log('PASS: collapsed advanced controls, clearing/retaining trails, new-body size/color, measurement grid and zoom units, mean/apsis radii, drag speed, pause, keyboard, presets, surface impact, touch and five-width layout audit.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error);process.exitCode = 1; });
