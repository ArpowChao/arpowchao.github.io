/* Run against a static HTTP server, e.g. BASEBALL_CFD_TEST_URL=http://127.0.0.1:4177/apps/baseball-cfd/index.html.
 * Requires Playwright and Chromium; PLAYWRIGHT_CHROMIUM_EXECUTABLE may select an installed browser.
 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const url = process.env.BASEBALL_CFD_TEST_URL || 'http://127.0.0.1:4177/apps/baseball-cfd/index.html';
const artifactDir = path.resolve(process.env.BASEBALL_CFD_TEST_ARTIFACT_DIR || 'scratch');
fs.mkdirSync(artifactDir, { recursive: true });

(async () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1050 }, acceptDownloads: true });
    // Font availability must not determine whether a numerical test can finish.
    await context.route(/^https:\/\/fonts\.(googleapis|gstatic)\.com\//, (route) => route.fulfill({ status: 200, body: '', contentType: 'text/css' }));
    await context.route('**/favicon.ico', (route) => route.fulfill({ status: 204, body: '' }));
    await context.addInitScript(() => {
      // Observe real worker messages, avoiding timing guesses about UI readiness.
      window.__cfdTest = { snapshot: null, errors: [] };
      const OriginalWorker = window.Worker;
      window.Worker = class extends OriginalWorker {
        constructor(...args) {
          super(...args);
          this.addEventListener('message', ({ data }) => {
            if (data.type === 'snapshot') window.__cfdTest.snapshot = data;
            if (data.type === 'error') window.__cfdTest.errors.push(data.message);
          });
        }
      };
    });
    const page = await context.newPage();
    const pageErrors = [], consoleErrors = [];
    page.on('pageerror', (error) => pageErrors.push(error.message));
    page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });

    async function waitReady(predicate, expected) {
      await page.waitForFunction(({ predicate, expected }) => {
        const s = window.__cfdTest.snapshot;
        return s && !document.getElementById('toggle-run').disabled &&
          s.smooth.diagnostics.stable && s.seamed.diagnostics.stable &&
          (predicate === 'steps' ? s.smooth.steps >= expected :
           predicate === 'paused' ? !s.running :
           predicate === 'config' ? Object.entries(expected).every(([k, v]) => s.config[k] === v) && s.smooth.steps === 0 : true);
      }, { predicate, expected }, { timeout: 60000 });
    }
    async function steps() { return page.evaluate(() => window.__cfdTest.snapshot.smooth.steps); }
    async function setRange(id, value) {
      await page.locator(`#${id}`).evaluate((input, value) => { input.value = value; input.dispatchEvent(new Event('input', { bubbles: true })); }, String(value));
    }
    async function pause() {
      await page.locator('#toggle-run').click();
      await waitReady('paused');
      assert.equal(await page.locator('#toggle-run').textContent(), '繼續');
      assert.equal(await page.locator('#step').isEnabled(), true);
    }
    async function noOverflow(width) {
      const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, body: document.body.scrollWidth, html: document.documentElement.scrollWidth }));
      assert.ok(dimensions.body <= width && dimensions.html <= width, `page should fit ${width}px viewport: ${JSON.stringify(dimensions)}`);
      for (const selector of ['.controls', '.experiment-toolbar', '.flow-comparison', '.pressure-panel', '.export-row']) {
        const box = await page.locator(selector).boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `${selector} should stay inside ${width}px viewport`);
      }
    }
    const canvasImage = () => page.locator('#smooth-canvas').evaluate((canvas) => canvas.toDataURL());

    await waitReady('steps', 510);
    await pause();
    const pausedSteps = await steps();
    await page.waitForTimeout(250);
    assert.equal(await steps(), pausedSteps, 'pause must freeze real numerical steps');
    assert.match(await page.locator('#status-text').textContent(), /已暫停/);
    await noOverflow(1440);
    await page.screenshot({ path: path.join(artifactDir, 'baseball-cfd-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    await noOverflow(390);
    await page.screenshot({ path: path.join(artifactDir, 'baseball-cfd-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 320, height: 800 });
    await noOverflow(320);
    await page.setViewportSize({ width: 1440, height: 1050 });
    console.log(`default flow screenshots saved at ${pausedSteps} synchronized steps`);

    await page.locator('#step').click();
    await page.waitForFunction((expected) => window.__cfdTest.snapshot.smooth.steps === expected, pausedSteps + 24);
    assert.equal(await steps(), pausedSteps + 24, 'single-step must advance exactly 24 steps');
    await page.waitForTimeout(150);
    assert.equal(await steps(), pausedSteps + 24, 'single-step must leave the solver paused');
    assert.equal(await page.evaluate(() => window.__cfdTest.snapshot.seamed.steps), pausedSteps + 24, 'both cases advance together');

    await setRange('speed', 150);
    await setRange('spin', -2000);
    await setRange('seam-height', 1.1);
    await setRange('seam-angle', 75);
    await page.locator('.advanced summary').click();
    await setRange('model-re', 140);
    await waitReady('config', { speedKmh: 150, spinRpm: -2000, seamHeightMm: 1.1, seamAngleDeg: 75, modelRe: 140 });
    assert.equal(await page.locator('#toggle-run').textContent(), '繼續', 'changing parameters must preserve paused state');
    assert.equal(await page.locator('#steps-label').textContent(), '0 步', 'changed conditions start a new snapshot');
    assert.match(await page.locator('#speed-output').textContent(), /150/);
    assert.match(await page.locator('#spin-output').textContent(), /2000/);
    assert.match(await page.locator('#spin-direction').textContent(), /順時針/);
    assert.match(await page.locator('#seam-height-output').textContent(), /1\.1/);
    assert.equal(await page.locator('#model-re-output').textContent(), '140');
    assert.match(await page.locator('#spin-ratio').textContent(), /^−/);

    await page.locator('[name="seam-count"][value="4"]').check();
    await waitReady('config', { seamCount: 4 });
    assert.match(await page.locator('#seam-detail').textContent(), /^4 處/);
    assert.equal(await page.evaluate(() => window.__cfdTest.snapshot.seamed.geometry.seamCenters.length), 4, 'four seams must reach numerical geometry');

    await setRange('seam-height', 0);
    await waitReady('config', { seamHeightMm: 0 });
    await page.locator('#step').click();
    await page.waitForFunction(() => window.__cfdTest.snapshot.smooth.steps === 24);
    assert.equal((await page.locator('#wake-difference').textContent()).replace(/\s+/g, ''), '0.00%', 'zero-height control must produce zero numerical RMS difference');
    assert.match(await page.locator('#observation-title').textContent(), /相同流場/);

    const speedImage = await canvasImage();
    for (const [field, legend] of [['pressure', '壓力係數 Cp'], ['vorticity', '渦度 × D / U'], ['speed', '流速 / 來流速度 U']]) {
      await page.locator(`[data-field="${field}"]`).click();
      assert.equal(await page.locator('#legend-label').textContent(), legend);
      assert.equal(await page.locator(`[data-field="${field}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('[data-field][aria-pressed="true"]').count(), 1);
      await page.waitForTimeout(40);
      if (field !== 'speed') assert.notEqual(await canvasImage(), speedImage, `${field} must render a different actual field`);
      assert.equal(await steps(), 24, 'display modes must preserve the numerical snapshot');
    }
    const linesImage = await canvasImage();
    await page.locator('#streamlines').uncheck();
    await page.waitForTimeout(40);
    assert.notEqual(await canvasImage(), linesImage, 'streamline control must alter rendering');
    await page.locator('#streamlines').check();

    for (const [preset, config] of [
      ['still', { spinRpm: 0 }], ['ccw', { spinRpm: 1800 }],
      ['cw', { spinRpm: -1800 }], ['seams', { spinRpm: 0, seamAngleDeg: 75, seamHeightMm: 1.2, seamCount: 2 }]
    ]) {
      await page.locator(`[data-preset="${preset}"]`).click();
      await waitReady('config', config);
      assert.equal(await page.locator(`[data-preset="${preset}"]`).getAttribute('aria-pressed'), 'true');
      assert.equal(await page.locator('#toggle-run').textContent(), '繼續', 'presets must preserve paused state');
    }

    // Export includes both complete grids, genuine current metadata, and finite fluid fields.
    await page.locator('#step').click();
    await page.waitForFunction(() => window.__cfdTest.snapshot.smooth.steps === 24);
    const grid = await page.evaluate(() => ({ nx: window.__cfdTest.snapshot.smooth.nx, ny: window.__cfdTest.snapshot.smooth.ny }));
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#export-csv').click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), 'baseball-cfd-Re140-24steps.csv');
    const csvPath = path.join(artifactDir, 'baseball-cfd-export.csv');
    await download.saveAs(csvPath);
    const lines = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '').split(/\r?\n/);
    assert.match(lines[0], /2D low-Re cylinder model/);
    assert.match(lines[1], /speed_kmh=150,spin_rpm=0,model_Re=140/);
    assert.match(lines[1], /seam_reference_mm=1\.2/);
    assert.match(lines[1], /seam_count=2,steps=24$/);
    assert.equal(lines[3], 'case,x_grid,y_grid,solid,ux_lattice,uy_lattice,rho_lattice,Cp,vorticity_lattice');
    const rows = lines.slice(4);
    assert.equal(rows.length, 2 * grid.nx * grid.ny, 'CSV must include every cell of both grids');
    assert.equal(rows[0].split(',').slice(0, 3).join(','), 'smooth,0,0');
    assert.equal(rows[grid.nx * grid.ny].split(',').slice(0, 3).join(','), 'seamed,0,0');
    assert.equal(rows.at(-1).split(',').slice(0, 3).join(','), `seamed,${grid.nx - 1},${grid.ny - 1}`);
    assert.ok(rows.every((row) => {
      const cells = row.split(',');
      return cells.length === 9 && cells.slice(1).every((cell) => Number.isFinite(Number(cell)));
    }), 'CSV numerical fields must all be finite');

    await page.locator('#reset').click();
    await waitReady('steps', 24);
    const resetConfig = await page.evaluate(() => window.__cfdTest.snapshot.config);
    for (const [key, expected] of Object.entries({ speedKmh: 130, spinRpm: 1800, seamHeightMm: .8, seamAngleDeg: 35, seamCount: 2, modelRe: 120 })) assert.equal(resetConfig[key], expected, `reset restores ${key}`);
    assert.equal(await page.locator('#toggle-run').textContent(), '暫停', 'reset must resume the solver');
    assert.equal(await page.locator('#step').isDisabled(), true);
    assert.equal(await page.locator('[name="seam-count"][value="2"]').isChecked(), true);
    assert.equal(await page.locator('[data-preset].active').count(), 0, 'reset clears preset selection');
    assert.deepEqual(await page.evaluate(() => window.__cfdTest.errors), [], 'worker should report no solver errors');
    assert.deepEqual(pageErrors, [], 'browser should report no uncaught errors');
    assert.deepEqual(consoleErrors, [], 'browser should report no console errors');
    console.log(`baseball CFD browser tests passed; CSV ${rows.length} rows; responsive widths 1440, 390, 320`);
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
