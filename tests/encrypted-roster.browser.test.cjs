const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const password = process.env.ROSTER_TEST_PASSWORD;
assert.ok(password, 'ROSTER_TEST_PASSWORD is required');

const artifactDir = process.env.ROSTER_TEST_ARTIFACT_DIR || '.test-artifacts';
fs.mkdirSync(artifactDir, { recursive: true });

(async () => {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const browser = await chromium.launch({ headless: true, ...(executablePath ? { executablePath } : {}) });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const consoleErrors = [];
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });

    await page.goto('http://127.0.0.1:4173/apps/stagebyChanMingJu.html', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    await page.getByRole('button', { name: '班級助手' }).waitFor({ timeout: 60000 });
    await page.getByRole('button', { name: '班級助手' }).click();
    await page.getByRole('button', { name: '座位大師' }).click();

    const passwordInput = page.getByLabel('加密名單密碼');
    const importButton = page.getByRole('button', { name: '匯入', exact: true });
    await passwordInput.fill('incorrect-password');
    await importButton.click();
    await page.getByText('密碼錯誤', { exact: true }).waitFor({ timeout: 15000 });
    await page.screenshot({ path: path.join(artifactDir, 'encrypted-roster-ui.png'), fullPage: true });

    await passwordInput.fill(password);
    await passwordInput.press('Enter');
    await page.getByText('已匯入 33 人', { exact: true }).waitFor({ timeout: 15000 });
    assert.equal(await passwordInput.inputValue(), '', 'password field should clear after a successful import');

    await page.getByText('編輯名單 & 操作說明 (點擊展開)', { exact: true }).click();
    const rosterText = await page.locator('textarea').inputValue();
    const rosterLines = rosterText.split(/\r?\n/);
    assert.equal(rosterLines.length, 33, 'the UI should receive all 33 decrypted students');
    assert.ok(rosterLines.every((entry) => /^\d{2}\s+\S+/.test(entry)), 'the UI should display a seat number before every name');
    assert.ok(rosterLines[0].startsWith('01 ') && rosterLines.at(-1).startsWith('35 '), 'the UI should preserve the first and last seat numbers');
    assert.ok(!rosterLines.some((entry) => /^(10|33)\s/.test(entry)), 'the UI should preserve the empty seat numbers 10 and 33');

    await page.getByRole('button', { name: /依序/ }).click();
    const firstOccupiedSeat = page.locator('.seat-item.occupied').first();
    await firstOccupiedSeat.waitFor();
    assert.equal(await firstOccupiedSeat.locator('.seat-number-badge').count(), 1, 'an occupied seat should show a separate number badge');
    assert.equal(await firstOccupiedSeat.locator('.seat-student-name').count(), 1, 'an occupied seat should show the student name separately');
    assert.equal(await firstOccupiedSeat.locator('.seat-note-input').getAttribute('placeholder'), '＋ 新增備註', 'the note field should read as a lightweight secondary action');
    const badgeBox = await firstOccupiedSeat.locator('.seat-number-badge').boundingBox();
    const nameBox = await firstOccupiedSeat.locator('.seat-student-name').boundingBox();
    assert.ok(badgeBox && nameBox && nameBox.y >= badgeBox.y + badgeBox.height - 1, 'the seat number badge should not overlap the student name');

    const seatBox = await firstOccupiedSeat.boundingBox();
    assert.ok(seatBox && seatBox.width / seatBox.height >= 1.15, 'seat cards should use a readable horizontal proportion');
    const seatColors = await firstOccupiedSeat.evaluate((element) => {
      const style = getComputedStyle(element);
      return { background: style.backgroundColor, color: style.color };
    });
    assert.notEqual(seatColors.background, 'rgb(136, 201, 161)', 'occupied seats should not use the old flat green background');
    assert.notEqual(seatColors.color, 'rgb(255, 255, 255)', 'occupied seats should use dark high-contrast text');

    await page.getByRole('button', { name: /障礙/ }).click();
    const lastSeat = page.locator('.seat-item').last();
    await lastSeat.click();
    assert.equal(await lastSeat.locator('.seat-blocked-label').textContent(), '空位', 'a cancelled seat should clearly say that it is empty');

    const importBox = await passwordInput.locator('xpath=..').boundingBox();
    assert.ok(importBox, 'encrypted roster controls should be visible');
    assert.ok(importBox.x >= 0 && importBox.x + importBox.width <= 1440, 'encrypted roster controls should fit the desktop viewport');

    const relevantErrors = consoleErrors.filter((message) => message.toLowerCase().includes('roster'));
    assert.deepEqual(relevantErrors, [], `encrypted roster logged browser errors: ${relevantErrors.join('; ')}`);
  } finally {
    await browser.close();
  }
  console.log('encrypted roster browser test passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
