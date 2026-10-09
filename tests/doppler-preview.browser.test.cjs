'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.DOPPLER_TEST_URL || 'http://127.0.0.1:4179/apps/doppler/index.html';
const artifacts = path.resolve('scratch/doppler-qa');
fs.mkdirSync(artifacts, { recursive: true });
const seed = { manualCenters: Array.from({ length: 6 }, (_, n) => ({ n, x: n * .5, y: 0, placed: true })), manualSettings: { c: 1, f: 1, mach: 0 }, answers: ['', '', '', ''] };
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  const errors = [];
  try {
    const context = await browser.newContext({ viewport: { width: 1024, height: 1600 }, acceptDownloads: true });
    await context.addInitScript(saved => localStorage.setItem('doppler-worksheet-v1', JSON.stringify(saved)), seed);
    const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.clock.install(); await page.goto(url);
    assert.equal(await page.locator('#manual-playback').isVisible(), false);
    await page.locator('#observers').check(); await page.locator('#quack-sound').uncheck();
    const saved = await page.evaluate(() => localStorage.getItem('doppler-worksheet-v1'));
    const bitmap = () => page.locator('#pond').evaluate(c => c.toDataURL());
    const original = await bitmap();
    await page.locator('#preview-play').click();
    assert.equal(await page.locator('#duck-a-count').textContent(), '收到 1 次');
    assert.equal(await page.locator('#duck-b-count').textContent(), '收到 1 次');
    assert.equal(await page.locator('#duck-a-reading').getAttribute('data-flash'), 'true');
    assert.ok(await page.locator('#pond').evaluate(c => {
      const r = c.getBoundingClientRect(), scale = r.width / 12.5, ratio = c.width / r.width;
      const [red, green, blue] = c.getContext('2d').getImageData(Math.round((r.width / 2 + 5 * scale + 22) * ratio), Math.round((r.height / 2 - 18) * ratio), 1, 1).data;
      return red > 240 && green > 210 && blue < 200;
    }), 'a wave contact paints a visible gold flash around the duck on the water');
    await page.locator('#manual-playback').screenshot({ path: path.join(artifacts, 'duck-contact.png') });
    await page.locator('.experiment').screenshot({ path: path.join(artifacts, 'duck-contact-board.png') });
    await page.clock.runFor(550);
    assert.equal(await page.locator('#duck-a-count').textContent(), '收到 2 次');
    assert.equal(await page.locator('#duck-b-count').textContent(), '收到 1 次');
    assert.equal(await page.locator('#duck-a-interval').textContent(), '最近間隔 0.500 s');
    assert.notEqual(await bitmap(), original, 'student waves expand from their own centres');
    await page.locator('#preview-play').click(); const paused = await page.locator('#preview-time').textContent();
    await page.clock.runFor(1000); assert.equal(await page.locator('#preview-time').textContent(), paused);
    await page.locator('#preview-play').click(); await page.clock.runFor(1050);
    assert.equal(await page.locator('#duck-a-count').textContent(), '收到 4 次');
    assert.equal(await page.locator('#duck-b-count').textContent(), '收到 2 次');
    assert.equal(await page.locator('#duck-b-interval').textContent(), '最近間隔 1.500 s');
    assert.equal(await page.evaluate(() => localStorage.getItem('doppler-worksheet-v1')), saved, 'playing preserves the original placement');
    await page.locator('#preview-play').click();
    const pending = page.waitForEvent('download'); await page.locator('#capture-only').click();
    const download = await pending; assert.match(download.suggestedFilename(), /my-waves/);
    await download.saveAs(path.join(artifacts, 'student-waves-playing.png'));
    await page.locator('#preview-reset').click(); assert.equal(await bitmap(), original, 'reset restores the exact student bitmap');
    assert.equal(await page.locator('#duck-a-count').textContent(), '收到 0 次');
    await page.locator('#preview-play').click(); await page.clock.runFor(7100);
    assert.equal(await page.locator('#duck-a-count').textContent(), '收到 5 次');
    assert.equal(await page.locator('#duck-b-count').textContent(), '收到 5 次');
    assert.equal(await page.locator('#preview-play').getAttribute('aria-pressed'), 'false');
    // Moving a duck exits playback, then uses its new position. Waves already
    // past that point are omitted rather than falsely counted again.
    await page.locator('#pond').scrollIntoViewIfNeeded();
    const pond = await page.locator('#pond').boundingBox(), metre = pond.width / 12.5;
    await page.mouse.move(pond.x + pond.width / 2 + 5 * metre, pond.y + pond.height / 2);
    await page.mouse.down(); await page.mouse.move(pond.x + pond.width / 2 + 3.9 * metre, pond.y + pond.height / 2, { steps: 6 }); await page.mouse.up();
    assert.equal(await page.locator('#preview-reset').isDisabled(), true);
    await page.locator('#preview-play').click();
    assert.equal(await page.locator('#duck-a-count').textContent(), '收到 0 次');
    await page.clock.runFor(1250);
    assert.equal(await page.locator('#duck-a-count').textContent(), '收到 2 次', 'already-passed fronts never hit the repositioned duck again');
    await page.locator('#piece-select').selectOption('1'); await page.locator('#piece-y').fill('0.5');
    await page.locator('#position-form button[type=submit]').click();
    assert.equal(await page.locator('#duck-a-count').textContent(), '收到 0 次', 'editing starts a fresh experiment');
    assert.equal(await page.locator('#preview-reset').isDisabled(), true);
    // Visible controls and both readings reflow at every required width.
    const audit = process.env.ORBIT_LAYOUT_AUDIT;
    const script = audit ? fs.readFileSync(audit, 'utf8').match(/AUDIT_JS = r"""([\s\S]*?)"""/)[1] : null;
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1600 }); await page.clock.runFor(30);
      if (script) {
        const report = await page.evaluate(new Function('return (' + script + ')')(), { targetSelector: 'main', textSelectors: ['#preview-note', '.copy:not([hidden]):not([hidden] *)', '.question'], minTextWidth: 96 });
        assert.deepEqual(report.failures, [], width + ': ' + JSON.stringify(report));
      }
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await page.locator('.duck-readings > div').count(), 2);
      await page.locator('#manual-playback').screenshot({ path: path.join(artifacts, 'playback-controls-' + width + '.png') });
    }
    await page.locator('#scatter').click();
    assert.equal(await page.locator('#preview-play').isDisabled(), true, 'no circles in the water means no supplied playback solution');
    assert.equal(await page.locator('[data-piece="5"]').getAttribute('data-placed'), 'true');
    await context.close();
    // Exercise the real browser audio graph: collision creates a call for each
    // duck; muting prevents all subsequent calls while arrival counts continue.
    const sound = await browser.newContext({ viewport: { width: 1024, height: 1600 } });
    await sound.addInitScript(saved => {
      localStorage.setItem('doppler-worksheet-v1', JSON.stringify(saved));
      const Native = window.AudioContext; window.__calls = 0;
      window.AudioContext = class extends Native {
        constructor() { super(); window.__audio = this; }
        createOscillator() { const o = super.createOscillator(), start = o.start.bind(o); o.start = (...args) => { window.__calls++; return start(...args); }; return o; }
      };
    }, seed);
    const audioPage = await sound.newPage(); audioPage.on('pageerror', e => errors.push(e.message));
    await audioPage.clock.install(); await audioPage.goto(url); await audioPage.locator('#observers').check();
    await audioPage.locator('#test-quack').click();
    assert.equal(await audioPage.evaluate(() => window.__calls), 1, 'test button directly starts an audible call without waiting for a wave');
    assert.equal(await audioPage.locator('#duck-a-count').textContent(), '收到 0 次');
    assert.equal(await audioPage.locator('#preview-play').getAttribute('aria-pressed'), 'false');
    assert.match(await audioPage.locator('#sound-status').textContent(), /已試播/);
    await audioPage.locator('#preview-play').click();
    assert.equal(await audioPage.evaluate(() => window.__calls), 3, 'exact contact at playback start calls once per duck');
    assert.equal(await audioPage.evaluate(() => window.__audio.state), 'running');
    // Render the same sound graph offline, avoiding dependence on headless
    // Chrome's audio device latency or an already-ended 190 ms call.
    const audioLevel = await audioPage.evaluate(async () => {
      const c = new OfflineAudioContext(2, 44100, 44100);
      Object.defineProperty(c, 'state', { get: () => 'running' });
      const call = new window.DopplerQuack(); call.context = c; call.play(0);
      const rendered = await c.startRendering(), left = rendered.getChannelData(0), right = rendered.getChannelData(1);
      const energy = data => data.reduce((sum, v) => sum + v * v, 0);
      return { peak: Math.max(...right.map(Math.abs)), rms: Math.sqrt(energy(right.slice(0, 13000)) / 13000),
        stereo: energy(right) > energy(left), cleanEnd: right.slice(15000).every(v => Math.abs(v) < .00001) };
    });
    assert.ok(audioLevel.rms > .065 && audioLevel.peak > .2 && audioLevel.peak < 1, 'the call has clear average volume without clipping: ' + JSON.stringify(audioLevel));
    assert.ok(audioLevel.stereo && audioLevel.cleanEnd, 'the sound remains stereo-positioned and ends cleanly');
    await audioPage.locator('#quack-sound').uncheck(); await audioPage.clock.runFor(1600);
    assert.equal(await audioPage.evaluate(() => window.__calls), 3, 'muted collisions create no sound');
    await audioPage.locator('#test-quack').click();
    assert.equal(await audioPage.locator('#quack-sound').isChecked(), true, 'test hearing also restores the sound option');
    assert.equal(await audioPage.evaluate(() => window.__calls), 4);
    assert.equal(await audioPage.locator('#duck-a-count').textContent(), '收到 4 次');
    assert.equal(await audioPage.locator('#duck-b-count').textContent(), '收到 2 次');
    await audioPage.locator('#preview-reset').click(); assert.equal(await audioPage.locator('#duck-a-count').textContent(), '收到 0 次');
    await sound.close();
    assert.deepEqual(errors, []);
    console.log('PASS: student wave playback, exact contacts, independent A/B flash and intervals, pause/resume/reset, five-wave completion, unchanged work, PNG, responsive controls, real audible quack graph and mute.');
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
