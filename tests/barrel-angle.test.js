'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../apps/barrel-angle/barrel-physics.js');

const near = (a, b, tol, msg) =>
  assert.ok(Math.abs(a - b) <= tol, `${msg || ''} expected ${a} ≈ ${b} (±${tol})`);

test('MLB Statcast Barrel zone matches reel benchmarks (158, 161, 187 km/h)', () => {
  const z158 = B.barrelZone(158);
  assert.equal(z158.isBarrelEligible, true);
  assert.equal(z158.minDeg, 26);
  assert.equal(z158.maxDeg, 30);
  assert.equal(z158.widthDeg, 4);

  const z161 = B.barrelZone(161);
  assert.equal(z161.minDeg, 24);
  assert.equal(z161.maxDeg, 33);
  assert.equal(z161.widthDeg, 9);

  const z187 = B.barrelZone(187);
  assert.equal(z187.minDeg, 8);
  assert.equal(z187.maxDeg, 50);
  assert.equal(z187.widthDeg, 42);

  const zSlow = B.barrelZone(140);
  assert.equal(zSlow.isBarrelEligible, false);
  assert.equal(zSlow.widthDeg, 0);
});

test('158 km/h default simulation matches IG Reel 10°, 28°, and 45° benchmarks', () => {
  const r10 = B.simulateBattedBall({ speedKmh: 158, angleDeg: 10 });
  near(r10.carryM, 83, 2.5, '10° carry ~83m');
  near(r10.hangTimeS, 2.6, 0.2, '10° hang time ~2.6s');
  assert.equal(r10.outcome, 'HIT');

  const r28 = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28 });
  near(r28.carryM, 114, 2.5, '28° carry ~114m');
  near(r28.hangTimeS, 4.96, 0.2, '28° hang time ~5.0s');
  assert.equal(r28.outcome, 'HR');
  assert.equal(r28.isBarrel, true);

  const r45 = B.simulateBattedBall({ speedKmh: 158, angleDeg: 45 });
  near(r45.carryM, 103, 3.0, '45° carry ~103m');
  near(r45.hangTimeS, 6.4, 0.3, '45° hang time ~6.4s');
  assert.equal(r45.outcome, 'OUT');
  assert.equal(r45.isBarrel, false);
});

test('60° to 90° high pop-ups and paradoxical backward loop with backspin', () => {
  const r60 = B.simulateBattedBall({ speedKmh: 158, angleDeg: 60 });
  assert.ok(r60.carryM > 50 && r60.carryM < 85, `60° carry ${r60.carryM}`);
  assert.ok(r60.apexM > 50, `60° apex ${r60.apexM}`);

  const r75 = B.simulateBattedBall({ speedKmh: 158, angleDeg: 75 });
  assert.ok(r75.carryM > 10 && r75.carryM < 45, `75° carry ${r75.carryM}`);

  // At 85°~90°, backspin Magnus force pushes rising ball backward (-x), landing behind home plate!
  const r90Spin = B.simulateBattedBall({ speedKmh: 158, angleDeg: 90, spinEnabled: true });
  assert.ok(r90Spin.carryM < -10, `90° with backspin loops behind home plate: ${r90Spin.carryM}m`);
  assert.equal(r90Spin.outcome, 'POPUP_BACK');

  // Without spin, 90° goes straight up and lands at x = 0
  const r90NoSpin = B.simulateBattedBall({ speedKmh: 158, angleDeg: 90, spinEnabled: false });
  near(r90NoSpin.carryM, 0, 0.1, '90° without spin lands at home plate');
});

test('compareModels and sweepAngles (0°~90°) show optimal angle lowering from 45° (vacuum) to ~28° (aero)', () => {
  const cmp = B.compareModels({ speedKmh: 158, angleDeg: 45 });
  assert.ok(cmp.vacuum.carryM > 190, 'vacuum 45° flies ~197m');
  assert.ok(cmp.full.carryM < 110, 'aero 45° falls short of 110m wall');

  // At low angle (10°), backspin lift keeps ball airborne longer so full > dragOnly and even > vacuum
  const cmp10 = B.compareModels({ speedKmh: 158, angleDeg: 10 });
  assert.ok(cmp10.full.carryM > cmp10.vacuum.carryM, '10° backspin carries farther than vacuum');
  assert.ok(cmp10.full.carryM > cmp10.dragOnly.carryM, '10° backspin carries farther than drag-only');

  const sweep = B.sweepAngles({ speedKmh: 158 }, 90, 1);
  assert.equal(sweep.angles.length, 91);
  near(sweep.optimal.vacuum.angleDeg, 45, 1, 'vacuum optimal angle is ~45°');
  assert.ok(sweep.optimal.full.angleDeg >= 26 && sweep.optimal.full.angleDeg <= 31, `aero optimal angle ${sweep.optimal.full.angleDeg}°`);
});

test('altitude (Coors Field) and tailwind increase carry distance', () => {
  const sea = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28, altitudeM: 0, windMs: 0 });
  const highAlt = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28, altitudeM: 1600, windMs: 0 });
  const tailwind = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28, altitudeM: 0, windMs: 5 });
  assert.ok(highAlt.carryM > sea.carryM + 4, `Coors Field adds carry: ${highAlt.carryM} vs ${sea.carryM}`);
  assert.ok(tailwind.carryM > sea.carryM + 5, `Tailwind adds carry: ${tailwind.carryM} vs ${sea.carryM}`);
});

test('HTML and Storyboard include full 0°~90° angle range and 60°~90° pop-up chapter', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../apps/barrel-angle/index.html'), 'utf8');
  assert.match(html, /id="angle-slider"[^>]*min="0"[^>]*max="90"/);
  assert.match(html, /60°–90°/);
  assert.equal(B.STORY_CHAPTERS.length, 8);
  const popupChapter = B.STORY_CHAPTERS.find((c) => c.id === 'popup60_90');
  assert.ok(popupChapter, 'has 60~90 deg pop-up story chapter');
  assert.deepEqual(popupChapter.fanRange, [0, 90]);
});

