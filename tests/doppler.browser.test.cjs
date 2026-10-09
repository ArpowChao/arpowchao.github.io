'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const { chromium } = require('playwright');
const url = process.env.DOPPLER_TEST_URL || 'http://127.0.0.1:4179/apps/doppler/index.html';
const artifacts = path.resolve('scratch/doppler-qa');
fs.mkdirSync(artifacts, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1600 }, acceptDownloads: true });
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', e => { if (e.type() === 'error') errors.push(e.text()); });
    await page.goto(url);
    assert.equal(await page.locator('#automatic').isChecked(), false);
    assert.equal(await page.locator('#timeline').isVisible(), false);
    assert.equal(await page.locator('#piece-select option').count(), 6);
    assert.equal(await page.locator('#tray-pieces > button').count(), 6);
    assert.doesNotMatch(await page.locator('#tray-pieces').textContent(), /λ/, 'tray labels use circle numbers only');
    const workspace = await page.locator('#pond').boundingBox(), settings = await page.locator('.controls').boundingBox(), experiment = await page.locator('.experiment').boundingBox();
    assert.ok(workspace.width >= 1100 && workspace.height >= 800, 'the whole workspace grows beyond the old sidebar layout');
    assert.ok(settings.y >= experiment.y + experiment.height - 1, 'settings leave the drawing width available');
    assert.equal(await page.locator('#pond').getAttribute('data-placed-circle-count'), '0', 'circles start beside the workspace, not scattered over it');
    assert.equal(await page.locator('[data-piece="5"]').getAttribute('data-placed'), 'true', 'the source duck stays on the water');
    const snapBounds = await page.locator('#snap-grid').boundingBox();
    assert.ok(snapBounds.y + snapBounds.height < workspace.y, 'the magnetic checkbox is above the canvas');
    assert.equal(await page.locator('#pond').getAttribute('data-wavelength'), '1');
    assert.equal(await page.locator('#pond').getAttribute('data-small-cell'), '0.25');
    assert.match(await page.locator('#grid-caption').textContent(), /1 大格 = 1λ = 1 m；每大格 4 小格/);
    // Read the rendered pixels: large wavelength squares contain three lighter
    // quarter-wave lines, with clearer spacing than the old 1/5-wave grid.
    const gridPixels = await page.locator('#pond').evaluate(c => {
      const r = c.getBoundingClientRect(), scale = Math.min(r.width, r.height) / 12.5, ratio = c.width / r.width;
      const ink = fraction => {
        const pixels = c.getContext('2d').getImageData(Math.round((r.width / 2 + fraction * scale) * ratio) - 1, Math.round((r.height / 2 + 1.13 * scale) * ratio) - 1, 3, 3).data;
        return Math.min(...Array.from({ length: 9 }, (_, n) => pixels[n * 4] + pixels[n * 4 + 1] + pixels[n * 4 + 2]));
      };
      return { major: ink(1), minor: [.25, .5, .75].map(ink), background: ink(.12), spacing: scale / 4 };
    });
    assert.ok(gridPixels.spacing > 24, 'removing the scale cap doubles desktop grid spacing');
    assert.ok(Math.abs(workspace.height - workspace.width) < 1, 'the compact board has no unused side ranges');
    assert.equal(await page.locator('#pan-view,#zoom-in').count(), 0, 'arranging waves needs no camera movement');
    assert.ok(gridPixels.minor.every(value => value < gridPixels.background - 15), 'all quarter-wave lines are visible');
    assert.ok(gridPixels.major < Math.min(...gridPixels.minor) - 30, 'major grid lines remain clearly darker');
    await page.screenshot({ path: path.join(artifacts, 'tray-1440.png'), fullPage: false });
    const placeFromTray = async (n, x, y) => {
      await page.locator('#piece-select').selectOption(String(n));
      const alreadyPlaced = await page.locator(`[data-piece="${n}"]`).getAttribute('data-placed') === 'true';
      const oldPosition = alreadyPlaced ? (await page.locator('#piece-readout').textContent()).match(/-?\d+\.\d+/g).map(Number) : null;
      await page.locator('.assembly-space').scrollIntoViewIfNeeded();
      const tray = await page.locator(`[data-piece="${n}"]`).boundingBox();
      const r = await page.locator('#pond').boundingBox(), scale = Math.min(r.width, r.height) / 12.5;
      await page.mouse.move(alreadyPlaced ? r.x + r.width / 2 + oldPosition[0] * scale : tray.x + tray.width / 2,
        alreadyPlaced ? r.y + r.height / 2 - oldPosition[1] * scale : tray.y + tray.height / 2); await page.mouse.down();
      await page.mouse.move(r.x + r.width / 2 + x * scale, r.y + r.height / 2 - y * scale, { steps: 12 }); await page.mouse.up();
      assert.equal(await page.locator(`[data-piece="${n}"]`).getAttribute('data-placed'), 'true');
    };
    assert.equal(await page.locator('#snap-grid').isChecked(), true);
    await page.locator('#snap-grid').uncheck(); await page.reload();
    assert.equal(await page.locator('#snap-grid').isChecked(), false, 'magnetic preference survives reload');
    await page.locator('#snap-grid').check();
    await placeFromTray(0, .62, -.07);
    assert.match(await page.locator('#piece-readout').textContent(), /0.50, 0.00.*r=5.00/, 'dragging snaps the centre to quarter-wave intersections');
    await page.locator('#undo-piece').click();
    await page.locator('#snap-grid').uncheck(); await placeFromTray(0, .62, -.07);
    assert.match(await page.locator('#piece-readout').textContent(), /0.62, -0.07/, 'free dragging remains available');
    await page.locator('#snap-grid').check();
    const setCoordinate = async (x, y) => {
      await page.locator('#piece-x').fill(String(x)); await page.locator('#piece-y').fill(String(y));
      await page.locator('#position-form button[type=submit]').click();
    };
    await setCoordinate(.75, 0);
    assert.match(await page.locator('#piece-readout').textContent(), /0.75, 0.00/);
    await setCoordinate(.62, -.07);
    assert.match(await page.locator('#piece-readout').textContent(), /0.62, -0.07/, 'typed coordinates are exact even when drag snapping is enabled');
    await setCoordinate(999, 0);
    assert.match(await page.locator('#piece-readout').textContent(), /0.62, -0.07/, 'out-of-range input never silently relocates the circle');
    assert.match(await page.locator('#position-note').textContent(), /超出水面/);
    await page.locator('#piece-origin').click();
    assert.match(await page.locator('#piece-readout').textContent(), /0.00, 0.00/);
    for (const n of [1, 2]) {
      await page.locator('#piece-select').selectOption(String(n)); await page.locator('#piece-origin').click();
      assert.match(await page.locator('#piece-readout').textContent(), /0.00, 0.00/);
    }
    await page.locator('.experiment').screenshot({ path: path.join(artifacts, 'precise-alignment.png') });
    await page.locator('#piece-panel').screenshot({ path: path.join(artifacts, 'position-controls.png') });
    await page.locator('#scatter').click();
    // All five circles fit completely on the compact physical board;
    // the largest retains a margin for independent placement.
    await placeFromTray(0, .75, .75);
    assert.match(await page.locator('#piece-readout').textContent(), /0.75, 0.75.*r=5.00/);
    await page.locator('.experiment').screenshot({ path: path.join(artifacts, 'workspace-largest-circle.png') });
    await page.locator('#undo-piece').click();
    // Releasing in the tray leaves the workspace empty; placement can be undone.
    await page.locator('[data-piece="0"]').click();
    assert.equal(await page.locator('#pond').getAttribute('data-placed-circle-count'), '0');
    await placeFromTray(0, -2, 1.5); await page.locator('#undo-piece').click();
    assert.equal(await page.locator('[data-piece="0"]').getAttribute('data-placed'), 'false');
    // Click placement is an accessible alternative to dragging out of the tray.
    await page.locator('#pond').scrollIntoViewIfNeeded();
    const emptyPond = await page.locator('#pond').boundingBox();
    await page.mouse.click(emptyPond.x + emptyPond.width / 2 + 39, emptyPond.y + emptyPond.height / 2 + 26);
    assert.equal(await page.locator('#pond').getAttribute('data-placed-circle-count'), '1');
    await page.locator('#undo-piece').click(); await page.reload();
    assert.equal(await page.locator('#pond').getAttribute('data-placed-circle-count'), '0', 'unplaced circles survive reload');
    const studentCenters = [[-.5, .5], [1.5, 1], [-1.5, -1.5], [2, -1], [0, 2], [3, -2]];
    for (let n = 0; n < 6; n++) await placeFromTray(n, ...studentCenters[n]);
    const selected = async () => (await page.locator('#piece-readout').textContent()).match(/-?\d+\.\d+/g).map(Number);
    const centers = async () => {
      const result = [];
      for (let n = 0; n < 6; n++) { await page.locator('#piece-select').selectOption(String(n)); result.push(await selected()); }
      return result;
    };
    const startPieces = await centers();
    assert.equal(new Set(startPieces.map(p => p.slice(0, 2).join(','))).size, 6, 'each dragged piece has its own centre');
    const dragPiece = async (n, dx, dy, edge = false) => {
      await page.locator('#piece-select').selectOption(String(n)); const p = await selected();
      await page.locator('#pond').scrollIntoViewIfNeeded();
      const r = await page.locator('#pond').boundingBox(), scale = Math.min(r.width, r.height) / 12.5;
      const x = r.x + r.width / 2 + (p[0] - (edge ? p[2] : 0)) * scale;
      const y = r.y + r.height / 2 - p[1] * scale;
      await page.mouse.move(x, y); await page.mouse.down();
      await page.mouse.move(x + dx, y + dy, { steps: 4 }); await page.mouse.up();
      return selected();
    };
    // Every ring, including the zero-radius source marker, moves independently.
    for (let n = 0; n < 6; n++) {
      const before = await centers(), moved = await dragPiece(n, 22, 12, n === 0), after = await centers();
      assert.ok(moved[0] > before[n][0], 'drag changes the selected centre');
      assert.equal(moved[2], before[n][2], 'drag keeps the physical radius');
      for (let other = 0; other < 6; other++) if (other !== n) assert.deepEqual(after[other], before[other], 'other pieces must stay in place');
      if (n === 0) assert.ok(moved[0] - before[n][0] < 1, 'grabbing the circumference preserves pointer offset');
    }
    const beforeUndo = await centers(); await page.locator('#undo-piece').click();
    const undone = await centers(); assert.deepEqual(undone[5], startPieces[5]); assert.deepEqual(undone[0], beforeUndo[0]);
    await page.locator('#piece-select').selectOption('1'); const beforeKeys = await selected();
    await page.locator('#pond').focus(); await page.keyboard.press('Shift+ArrowRight');
    const afterKeys = await selected(); assert.ok(Math.abs(afterKeys[0] - beforeKeys[0] - .05) < .001); assert.equal(afterKeys[2], beforeKeys[2]);
    // Stack two centres, then select the covered piece and move only that one.
    await page.locator('#piece-select').selectOption('0'); const stackTarget = await selected();
    await page.locator('#piece-select').selectOption('1'); const toStack = await selected();
    const stackBox = await page.locator('#pond').boundingBox(), stackScale = Math.min(stackBox.width, stackBox.height) / 12.5;
    await dragPiece(1, (stackTarget[0] - toStack[0]) * stackScale, -(stackTarget[1] - toStack[1]) * stackScale);
    const stacked = await centers(); assert.ok(Math.hypot(stacked[0][0] - stacked[1][0], stacked[0][1] - stacked[1][1]) < .02);
    await page.locator('#piece-select').selectOption('0'); await page.locator('#pond').focus(); await page.keyboard.press('ArrowRight');
    const separated = await centers(); assert.ok(Math.abs(separated[0][0] - stacked[0][0] - .25) < .001); assert.deepEqual(separated[1], stacked[1]);
    const arrangement = await centers();
    const bitmap = () => page.locator('#pond').evaluate(c => c.toDataURL());
    const ownImage = await bitmap();
    await page.locator('[data-mach="0.75"]').click();
    assert.ok(await bitmap() === ownImage, 'a target velocity never supplies a layout');
    assert.deepEqual(await centers(), arrangement);
    await page.locator('#advanced > summary').click(); await page.locator('#automatic').check();
    assert.ok(await bitmap() !== ownImage);
    await page.locator('#automatic').uncheck();
    assert.ok(await bitmap() === ownImage, 'manual work survives automatic comparison');
    await page.reload(); assert.equal(await page.locator('#automatic').isChecked(), false);
    assert.deepEqual(await centers(), arrangement, 'manual centres survive reload');
    await page.locator('#scatter').click(); await page.locator('[data-mach="0"]').click();
    await page.locator('#observers').check();
    await page.locator('#advanced > summary').click(); await page.locator('#automatic').check(); await page.locator('#advanced > summary').click();
    assert.equal(await page.locator('#scene-time').textContent(), 't = 5.00 s');
    assert.equal(await page.locator('#advanced').getAttribute('open'), null);
    assert.equal(await page.locator('#arrival-panel').getAttribute('open'), null);
    assert.equal(await page.locator('#labels').isChecked(), false);
    const staticImage = await page.locator('#pond').screenshot();
    await page.locator('[data-mach="0.75"]').click();
    assert.equal(await page.locator('#time-readout').textContent(), '5.00 s');
    assert.notDeepEqual(await page.locator('#pond').screenshot(), staticImage);
    assert.match(await page.locator('#scene-setting').textContent(), /0.75/);
    await page.locator('#labels').check();
    await page.locator('#reset').click(); await page.locator('#step').click();
    assert.equal(await page.locator('#time-readout').textContent(), '1.00 s');
    await page.locator('#back').click(); assert.equal(await page.locator('#time-readout').textContent(), '0.00 s');
    await page.locator('#play').click(); await page.waitForTimeout(220); await page.locator('#play').click();
    assert.ok(Number(await page.locator('#time').inputValue()) > 0);
    const paused = await page.locator('#time').inputValue(); await page.waitForTimeout(150);
    assert.equal(await page.locator('#time').inputValue(), paused);
    await page.locator('#time').fill('5'); await page.locator('[data-mach="0"]').click();
    await page.locator('#arrival-panel > summary').click();
    assert.match(await page.locator('.arrival-card').first().textContent(), /目前抵達 1 次/);
    await page.locator('#time').fill('10');
    assert.match(await page.locator('.arrival-card').first().textContent(), /目前抵達 6 次/);
    assert.match(await page.locator('.arrival-card').first().textContent(), /間隔：1.000 s/);
    await page.locator('[data-mach="0.5"]').click(); await page.locator('#time').fill('6');
    assert.match(await page.locator('.arrival-card').first().textContent(), /間隔：0.500 s/);
    assert.match(await page.locator('.arrival-card').nth(1).textContent(), /目前抵達 1 次/);
    await page.locator('#time').fill('10');
    assert.match(await page.locator('.arrival-card').nth(1).textContent(), /間隔：1.500 s/);
    await page.locator('#time').fill('5');
    // At the default view, a physical metre is (min(width,height)-54)/11.3 CSS px.
    await page.locator('#pond').scrollIntoViewIfNeeded();
    const box = await page.locator('#pond').boundingBox(), scale = (Math.min(box.width, box.height) - 54) / 11.3;
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(cx + 5 * scale, cy); await page.mouse.down();
    await page.mouse.move(cx + 4 * scale, cy - scale, { steps: 5 }); await page.mouse.up();
    assert.match(await page.locator('.arrival-card').first().textContent(), /\(4.0, 1.0\)/);
    await page.locator('#pond').focus(); await page.keyboard.press('ArrowUp');
    // A dragged coordinate can be microscopically below the 1.25 rounding tie.
    assert.match(await page.locator('.arrival-card').first().textContent(), /\(4.0, 1.[23]\)/);
    await page.locator('#measure').click();
    await page.locator('#pond').scrollIntoViewIfNeeded();
    const measureRect = await page.locator('#pond').boundingBox(), measureX = measureRect.x + measureRect.width / 2, measureY = measureRect.y + measureRect.height / 2;
    await page.mouse.move(measureX, measureY + 2 * scale); await page.mouse.down();
    await page.mouse.move(measureX + 2 * scale, measureY + 2 * scale, { steps: 5 }); await page.mouse.up();
    assert.match(await page.locator('#measurement').textContent(), /2.00 m/);
    await page.locator('#advanced > summary').click();
    await page.locator('#frequency').fill('2'); await page.locator('#frequency').press('Tab');
    assert.equal(await page.locator('#pond').getAttribute('data-wavelength'), '0.5');
    assert.equal(await page.locator('#pond').getAttribute('data-small-cell'), '0.125');
    assert.match(await page.locator('#grid-caption').textContent(), /1λ = 0.50 m/);
    await page.locator('#reset').click(); await page.locator('#step').click();
    assert.equal(await page.locator('#time-readout').textContent(), '0.50 s');
    await page.locator('#frequency').fill('3'); await page.locator('#frequency').press('Tab');
    assert.equal(await page.locator('#frequency').inputValue(), '2');
    await page.locator('#reverse').check(); assert.match(await page.locator('#scene-setting').textContent(), /向左/);
    await page.locator('#restore').click();
    assert.equal(await page.locator('#frequency').inputValue(), '1');
    await page.locator('#task').selectOption('1'); await page.locator('#load-task').click();
    assert.match(await page.locator('#scene-setting').textContent(), /0.25/);
    assert.equal(await page.locator('#automatic').isChecked(), false);
    assert.equal(await page.locator('#time-readout').textContent(), '5.00 s');
    await page.locator('#student').fill('測試 12號');
    await page.locator('#answer').fill('前方的波間距比較小，後方比較大。\n我用方格量測：前方 0.75 m、後方 1.25 m。');
    await page.locator('#task').selectOption('0'); await page.locator('#answer').fill('最外圈最早，因為已傳播最久。');
    await page.locator('#task').selectOption('1');
    assert.match(await page.locator('#answer').inputValue(), /0.75 m/);
    await placeFromTray(0, .75, .75);
    await page.locator('#piece-select').selectOption('0');
    const exportPiece = await selected();
    const exportRect = await page.locator('#pond').boundingBox();
    const downloadPromise = page.waitForEvent('download');
    await page.locator('#capture').click();
    const download = await downloadPromise, exportPath = path.join(artifacts, 'student-answer.png');
    await download.saveAs(exportPath);
    const png = fs.readFileSync(exportPath);
    assert.equal(png.subarray(1, 4).toString(), 'PNG');
    assert.equal(png.readUInt32BE(16), 1200); assert.ok(png.readUInt32BE(20) > 1100);
    // The PNG must retain the student's selected, gold circle at its own centre,
    // rather than exporting an automatic solution in place of the arrangement.
    assert.ok(await page.evaluate(async ({ data, piece, ratio, scale }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + data; await image.decode();
      const probe = document.createElement('canvas'); probe.width = image.width; probe.height = image.height;
      const c = probe.getContext('2d'); c.drawImage(image, 0, 0);
      const h = Math.round(1120 * ratio);
      const x = Math.round(40 + 560 + (piece[0] + piece[2]) * scale), y = Math.round(140 + h / 2 - piece[1] * scale);
      const pixels = c.getImageData(x - 2, y - 2, 5, 5).data;
      for (let i = 0; i < pixels.length; i += 4) if (Math.abs(pixels[i] - 164) < 8 && Math.abs(pixels[i + 1] - 119) < 8 && pixels[i + 2] < 10 && pixels[i + 3] === 255) return true;
      return false;
    }, { data: png.toString('base64'), piece: exportPiece, ratio: exportRect.height / exportRect.width,
      scale: Math.min(exportRect.width, exportRect.height) / 12.5 * 1120 / exportRect.width }), 'PNG keeps the complete hand-positioned circle near the workspace edge');
    assert.equal(await page.locator('#records > figure').count(), 1);
    const onlyPromise = page.waitForEvent('download'); await page.locator('#capture-only').click();
    const only = await onlyPromise; await only.saveAs(path.join(artifacts, 'pond-only.png'));
    assert.equal(await page.locator('#records > figure').count(), 2);
    await page.reload(); await page.locator('#task').selectOption('1');
    assert.match(await page.locator('#answer').inputValue(), /0.75 m/);
    assert.equal(await page.locator('#student').inputValue(), '測試 12號');
    assert.equal(await page.locator('#records > figure').count(), 0);
    // Verify hand-assembly controls and real answer content at all widths.
    await page.locator('#advanced > summary').click();
    const auditFile = process.env.ORBIT_LAYOUT_AUDIT;
    const source = auditFile ? fs.readFileSync(auditFile, 'utf8').match(/AUDIT_JS = r"""([\s\S]*?)"""/)[1] : null;
    const reports = [];
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      if (source) {
        const report = await page.evaluate(new Function('return (' + source + ')')(), { targetSelector: 'main', textSelectors: ['.intro', '.copy:not([hidden] *)', '.question', '.small-note:not([hidden] *)'], minTextWidth: 96 });
        assert.deepEqual(report.failures, [], width + ': ' + JSON.stringify(report)); reports.push({ width, ...report });
      }
      assert.equal(await page.locator('.lab-layout > *').count(), 2);
      const trayGeometry = await page.locator('#piece-tray').boundingBox(), pondGeometry = await page.locator('#pond').boundingBox();
      if (width > 1050) assert.ok(trayGeometry.x + trayGeometry.width <= pondGeometry.x + 1, 'tray stays beside the canvas');
      else assert.ok(trayGeometry.y + trayGeometry.height <= pondGeometry.y + 1, 'tablet and phone tray give the whole width to the board');
      assert.equal(await page.locator('[data-mach]').count(), 4);
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      assert.equal(await page.locator('button,input,select,textarea').evaluateAll(elements => elements.filter(el => {
        if (!el.getClientRects().length) return false;
        const r = el.getBoundingClientRect(); return r.left < -1 || r.right > innerWidth + 1;
      }).length), 0);
      await page.locator('.topbar').scrollIntoViewIfNeeded(); await page.screenshot({ path: path.join(artifacts, 'layout-' + width + '.png'), fullPage: false });
      await page.locator('#worksheet').screenshot({ path: path.join(artifacts, 'worksheet-' + width + '.png') });
    }
    // Automatic comparison also keeps its existing responsive layout.
    await page.locator('#automatic').check(); await page.locator('#arrival-panel > summary').click();
    for (const width of [320, 390, 768, 1024, 1440]) {
      await page.setViewportSize({ width, height: 1000 });
      if (source) {
        const report = await page.evaluate(new Function('return (' + source + ')')(), { targetSelector: 'main', textSelectors: ['.intro', '.copy:not([hidden] *)', '.question', '.small-note:not([hidden] *)'], minTextWidth: 96 });
        assert.deepEqual(report.failures, [], 'auto ' + width + ': ' + JSON.stringify(report)); reports.push({ width, mode: 'auto', ...report });
      }
    }
    fs.writeFileSync(path.join(artifacts, 'layout-report.json'), JSON.stringify(reports, null, 2));
    // The whole physical waveform fits without panning. Tablet trays move above
    // the square board rather than taking width from its wavelength grid.
    for (const width of [768, 1024]) {
      const tablet = await browser.newContext({ viewport: { width, height: 1500 }, hasTouch: true, acceptDownloads: true });
      const tp = await tablet.newPage(); tp.on('pageerror', e => errors.push(e.message)); await tp.goto(url);
      const board = await tp.locator('#pond').boundingBox(), tray = await tp.locator('#piece-tray').boundingBox();
      assert.ok(board.width >= width - 48, 'tablet uses all available page width');
      assert.ok(Math.abs(board.width - board.height) < 1, 'square board removes the extra horizontal or vertical field');
      assert.ok(tray.y + tray.height <= board.y + 1, 'circle tray is above the tablet board');
      assert.equal(await tp.locator('#pan-view,#zoom-value').count(), 0);
      const pixels = await tp.locator('#pond').evaluate(c => {
        const r = c.getBoundingClientRect(), scale = Math.min(r.width, r.height) / 12.5;
        const ratio = c.width / r.width, ctx = c.getContext('2d');
        const ink = x => {
          const data = ctx.getImageData(Math.round(x * ratio) - 1, Math.round((r.height / 2 + 1.13 * scale) * ratio), 3, 1).data;
          return Math.min(...Array.from({ length: 3 }, (_, i) => data[4*i] + data[4*i+1] + data[4*i+2]));
        };
        return { scale, spacing: scale / 4, minor: [.25, .5, .75].map(f => ink(r.width / 2 + f * scale)), background: ink(r.width / 2 + .12 * scale) };
      });
      assert.ok(pixels.spacing >= (width === 768 ? 14 : 19), 'tablet quarter-wave grid grows while keeping the whole largest ring visible');
      assert.ok(pixels.minor.every(ink => ink < pixels.background - 15), 'all enlarged quarter-wave lines are rendered');
      // Assemble the expected 3/4-speed exercise manually, including the duck.
      for (let n = 0; n < 6; n++) {
        await tp.locator('#piece-select').selectOption(String(n));
        await tp.locator('#piece-x').fill(String(n * .75)); await tp.locator('#piece-y').fill('0');
        await tp.locator('#position-form button[type=submit]').click();
        assert.match(await tp.locator('#piece-readout').textContent(), new RegExp((n * .75).toFixed(2) + ', 0.00'));
        if (n < 5) {
          const right = (n * .75 + 5 - n) * pixels.scale, left = (n * .75 - (5 - n)) * pixels.scale;
          assert.ok(board.width / 2 + right < board.width && board.width / 2 + left > 0, 'both edges of every complete circle fit simultaneously');
        }
      }
      await tp.locator('.experiment').screenshot({ path: path.join(artifacts, 'tablet-' + width + '-board.png') });
      const before = await tp.evaluate(() => localStorage.getItem('doppler-worksheet-v1'));
      await tp.locator('#measure').click(); await tp.locator('#pond').scrollIntoViewIfNeeded();
      const mb = await tp.locator('#pond').boundingBox(), mx = mb.x + mb.width * .3, my = mb.y + mb.height * .7;
      const ts = await tablet.newCDPSession(tp);
      await ts.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: mx, y: my }] });
      await ts.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: mx + pixels.scale, y: my }] });
      await ts.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      assert.match(await tp.locator('#measurement').textContent(), /1.00 m/);
      assert.equal(await tp.evaluate(() => localStorage.getItem('doppler-worksheet-v1')), before, 'measuring never moves the assembled circles');
      await tablet.close();
    }
    const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const phone = await touch.newPage(); phone.on('pageerror', e => errors.push(e.message)); await phone.goto(url);
    await phone.setViewportSize({ width: 320, height: 844 });
    await phone.screenshot({ path: path.join(artifacts, 'tray-320.png'), fullPage: false });
    await phone.setViewportSize({ width: 390, height: 844 });
    await phone.locator('#piece-select').selectOption('5');
    await phone.locator('#piece-x').fill('2'); await phone.locator('#piece-y').fill('0');
    await phone.locator('#position-form button[type=submit]').click();
    await phone.locator('#advanced > summary').click();
    await phone.locator('#frequency').fill('0.5'); await phone.locator('#frequency').press('Tab');
    assert.equal(await phone.locator('#piece-select option').count(), 4);
    await phone.locator('#piece-select').selectOption('3');
    assert.match(await phone.locator('#piece-readout').textContent(), /r=0.00 m/);
    assert.match(await phone.locator('#piece-readout').textContent(), /2.00, 0.00/, 'changing frequency preserves the duck position');
    assert.match(await phone.locator('#manual-toolbar').textContent(), /3 個圓圈/);
    await phone.locator('#restore').click(); await phone.locator('#piece-select').selectOption('0');
    assert.equal(await phone.locator('[data-piece="3"]').getAttribute('data-placed'), 'false', 'a source marker never becomes a pre-positioned circle');
    await phone.locator('.assembly-space').scrollIntoViewIfNeeded();
    const tb = await phone.locator('#pond').boundingBox(), session = await touch.newCDPSession(phone);
    const trayBox = await phone.locator('[data-piece="0"]').boundingBox();
    const sx = trayBox.x + trayBox.width / 2, sy = trayBox.y + trayBox.height / 2;
    const phoneBefore = await phone.locator('#piece-readout').textContent();
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: sx, y: sy }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tb.x + tb.width / 2, y: tb.y + tb.height / 2 }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.notEqual(await phone.locator('#piece-readout').textContent(), phoneBefore, 'touch moves an individual circle');
    assert.equal(await phone.locator('[data-piece="0"]').getAttribute('data-placed'), 'true');
    await phone.locator('#scatter').click();
    assert.equal(await phone.locator('#pond').getAttribute('data-placed-circle-count'), '0');
    assert.equal(await phone.locator('[data-piece="5"]').getAttribute('data-placed'), 'true');
    await phone.locator('[data-piece="0"]').focus(); await phone.keyboard.press('Enter');
    assert.equal(await phone.locator('[data-piece="0"]').getAttribute('data-placed'), 'true', 'keyboard can place a tray circle');
    await phone.locator('#measure').click(); await phone.locator('#pond').scrollIntoViewIfNeeded();
    const measureBox = await phone.locator('#pond').boundingBox();
    const tx = measureBox.x + measureBox.width * .4, ty = measureBox.y + measureBox.height * .7;
    await session.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: tx, y: ty }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: tx + 35, y: ty }] });
    await session.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.match(await phone.locator('#measurement').textContent(), /兩點距離/);
    // Existing untouched defaults are tidied; older student work is retained.
    for (const edited of [false, true]) {
      const legacy = await browser.newContext(), legacyPage = await legacy.newPage();
      const savedCenters = [[-2, 1.5], [1.5, 1], [-1.5, -1.5], [2, -1], [0, 2], [3, -2]].map(([x, y], n) => ({ n, x: x + (edited && n === 0 ? .25 : 0), y }));
      await legacy.addInitScript(value => localStorage.setItem('doppler-worksheet-v1', JSON.stringify(value)), { manualCenters: savedCenters, answers: ['保留回答', '', '', ''] });
      await legacyPage.goto(url);
      assert.equal(await legacyPage.locator('#pond').getAttribute('data-placed-count'), edited ? '6' : '1');
      assert.equal(await legacyPage.locator('#answer').inputValue(), '保留回答');
      if (edited) assert.match(await legacyPage.locator('#piece-readout').textContent(), /-1.75, 1.50/);
      await legacy.close();
    }
    await page.setViewportSize({ width: 720, height: 500 }); await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    assert.deepEqual(errors, []);
    console.log('PASS: compact square board, uncapped large grid, full five-ring tablet view, touch measurement, snapping/free drag, exact positioning, undo/keyboard/touch, preserved work, automatic comparison, PNG answers and five-width layout audits.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
