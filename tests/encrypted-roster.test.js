const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const htmlPath = path.join(root, 'apps', 'stagebyChanMingJu.html');
const rosterModulePath = path.join(root, 'apps', 'encrypted-roster.js');
const password = process.env.ROSTER_TEST_PASSWORD;
const forbiddenNames = (process.env.ROSTER_FORBIDDEN_NAMES || '').split(',').filter(Boolean);

assert.ok(password, 'ROSTER_TEST_PASSWORD is required to verify the encrypted roster');
assert.ok(forbiddenNames.length, 'ROSTER_FORBIDDEN_NAMES is required to scan for plaintext names');
assert.ok(fs.existsSync(rosterModulePath), 'apps/encrypted-roster.js should exist');

const htmlSource = fs.readFileSync(htmlPath, 'utf8');
const rosterSource = fs.readFileSync(rosterModulePath, 'utf8');
const publicSource = `${htmlSource}\n${rosterSource}`;

assert.ok(
  htmlSource.includes('encrypted-roster.js'),
  'the seating chart should load the encrypted roster module'
);
assert.ok(!publicSource.includes(password), 'the password must not appear in public source');

for (const name of forbiddenNames) {
  assert.ok(!publicSource.includes(name), `plaintext name must not appear in public source: ${name}`);
}

const secureRoster = require(rosterModulePath);

(async () => {
  await assert.rejects(
    secureRoster.decrypt(`${password}-wrong`),
    /INVALID_ROSTER_PASSWORD/,
    'an incorrect password should not decrypt the roster'
  );

  const entries = await secureRoster.decrypt(password);
  assert.equal(entries.length, 33, 'the encrypted roster should contain 33 students');
  assert.ok(entries.every((entry) => /^\d{2}\s+\S+/.test(entry)), 'every roster entry should include a two-digit seat number');
  assert.deepEqual(
    entries.map((entry) => entry.slice(0, 2)),
    [
      '01', '02', '03', '04', '05', '06', '07', '08', '09',
      '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
      '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
      '31', '32', '34', '35'
    ],
    'seat numbers should preserve the requested order and the empty numbers 10 and 33'
  );

  const names = entries.map((entry) => entry.replace(/^\d{2}\s+/, ''));
  const digest = crypto.createHash('sha256').update(names.join('\n'), 'utf8').digest('hex');
  assert.equal(
    digest,
    'a43f0fc45675deefc5a07c05815d6ce8bbfec520a78e99af149eb2f60241ba58',
    'the decrypted roster should match the requested list and order'
  );

  console.log('encrypted roster tests passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
