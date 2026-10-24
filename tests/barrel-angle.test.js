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
  assert.equal(r90Spin.isFair, false, 'behind home plate is foul territory');
  assert.equal(r90Spin.outcome, 'FOUL_BACKSTOP', 'lands beyond the 18.3 m backstop');

  const r85 = B.simulateBattedBall({ speedKmh: 158, angleDeg: 85 });
  assert.ok(r85.carryM < 0 && r85.carryM > -B.FIELD.backstopM, `85° lands just behind the plate: ${r85.carryM}`);
  assert.equal(r85.outcome, 'FOUL_POP', 'catchable foul pop-up');

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

test('fair / foul territory: foul lines at ±45°, behind home plate is foul', () => {
  assert.equal(B.judgeFair(100, 0).fair, true);
  assert.equal(B.judgeFair(100, 45).fair, true, 'on the line is fair');
  assert.equal(B.judgeFair(100, -45).fair, true);
  assert.equal(B.judgeFair(100, 46).fair, false);
  assert.equal(B.judgeFair(100, -50).fair, false);
  assert.equal(B.judgeFair(-5, 0).fair, false, 'behind the plate');
  const side = B.judgeFair(100, 30);
  near(side.landingX, 100 * Math.cos(30 * Math.PI / 180), 0.01);
  near(side.landingZ, 50, 0.01, '+spray = right-field side');

  // Same 28° home-run swing: inside the left-field pole → HR, just outside → long foul ball.
  const inside = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28, sprayDeg: -44 });
  assert.equal(inside.outcome, 'HR');
  const outside = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28, sprayDeg: -47 });
  assert.equal(outside.isFair, false);
  assert.equal(outside.outcome, 'FOUL_HR');
  assert.equal(outside.clearsWall, false, 'a foul ball never counts as clearing the wall');

  const shortFoul = B.simulateBattedBall({ speedKmh: 158, angleDeg: 10, sprayDeg: 55 });
  assert.equal(shortFoul.outcome, 'FOUL');

  // Wind toward center field only helps along the flight direction.
  const cf = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28, windMs: 6, sprayDeg: 0 });
  const line = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28, windMs: 6, sprayDeg: 45 });
  assert.ok(cf.carryM > line.carryM, 'tailwind component shrinks toward the lines');
});

test('altitude (Coors Field) and tailwind increase carry distance', () => {
  const sea = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28, altitudeM: 0, windMs: 0 });
  const highAlt = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28, altitudeM: 1600, windMs: 0 });
  const tailwind = B.simulateBattedBall({ speedKmh: 158, angleDeg: 28, altitudeM: 0, windMs: 5 });
  assert.ok(highAlt.carryM > sea.carryM + 4, `Coors Field adds carry: ${highAlt.carryM} vs ${sea.carryM}`);
  assert.ok(tailwind.carryM > sea.carryM + 5, `Tailwind adds carry: ${tailwind.carryM} vs ${sea.carryM}`);
});

test('HTML and Storyboard include full 0°~90° angle range, fair/foul spray, playback controls, and 7 camera presets', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const html = fs.readFileSync(path.join(__dirname, '../apps/barrel-angle/index.html'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../apps/barrel-angle/styles.css'), 'utf8');
  assert.match(html, /id="speed-slider"[^>]*min="80"[^>]*max="195"/);
  assert.match(html, /id="angle-slider"[^>]*min="0"[^>]*max="90"/);
  assert.match(html, /id="spray-slider"[^>]*min="-65"[^>]*max="65"/);
  for (const id of ['speed', 'angle', 'spray', 'rpm', 'cd', 'alt', 'wind']) {
    assert.match(html, new RegExp(`id="${id}-slider"[^>]*type="range"`), `${id} range slider preserved`);
    assert.match(html, new RegExp(`id="${id}-num"[^>]*type="number"`), `${id} direct numeric input`);
    assert.match(html, new RegExp(`data-step-target="${id}-slider"[^>]*data-step-dir="1"[^>]*>▲<`), `${id} up triangle button`);
    assert.match(html, new RegExp(`data-step-target="${id}-slider"[^>]*data-step-dir="-1"[^>]*>▼<`), `${id} down triangle button`);
  }
  assert.match(html, /id="play-pause-btn"/);
  assert.match(html, /data-speed="0\.125"/);
  assert.match(html, /data-speed="0\.5"/);
  assert.match(html, /data-speed="1"/);
  assert.match(html, /data-speed="2"/);
  for (const cam of ['stadium', 'catcher', 'batter', 'side', 'top', 'outfield', 'follow']) {
    assert.match(html, new RegExp(`data-cam="${cam}"`), `camera preset ${cam}`);
  }
  // Clear, non-overlapping legend for all 3 models
  assert.match(html, /真實擊球（空氣阻力＋後旋升力，耀眼金黃）/);
  assert.match(html, /界外球 ／ 60°–90° 沖天炮倒退（雷射紅）/);
  assert.match(html, /僅空氣阻力（無後旋升力，皇家藍）/);
  assert.match(html, /真空無阻力（銀白對照線，45° 最遠）/);
  // KaTeX math rendering assets in HTML
  assert.match(html, /katex(\.min)?\.css/);
  assert.match(html, /katex(\.min)?\.js/);
  assert.match(html, /auto-render(\.min)?\.js/);
  assert.match(css, /color-scheme:\s*light/);
  assert.match(html, /60°–90°/);
  assert.equal(B.STORY_CHAPTERS.length, 8);
  const popupChapter = B.STORY_CHAPTERS.find((c) => c.id === 'popup60_90');
  assert.ok(popupChapter, 'has 60~90 deg pop-up story chapter');
  assert.deepEqual(popupChapter.fanRange, [0, 90]);
});

test('app.js and styles.css configure black night stadium sky, high-contrast non-green default (gold), and thin luminous tracers', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const appJs = fs.readFileSync(path.join(__dirname, '../apps/barrel-angle/app.js'), 'utf8');
  const css = fs.readFileSync(path.join(__dirname, '../apps/barrel-angle/styles.css'), 'utf8');

  // Black sky
  assert.match(appJs, /setClearColor\(0x05070e,\s*1\)/);
  assert.match(css, /\.stage\s*\{[^}]*#060913/);

  // Thinner tracer: core tube radius <= 0.12 (previous bulky tube was 0.36m!)
  assert.match(appJs, /coreRadius:\s*0\.105/);
  // High-intensity optic center filament
  assert.match(appJs, /filamentRadius:\s*0\.048/);
  // Non-overlapping color signatures for 3 models + foul
  assert.match(appJs, /0xffea00/); // Real trajectory (Golden Yellow)
  assert.match(appJs, /0xff1744/); // Foul trajectory (Laser Crimson)
  assert.match(appJs, /0x3b82f6/); // Drag-only trajectory (Royal Blue)
  assert.match(appJs, /0xe2e8f0/); // Vacuum trajectory (Silver-White)
  assert.match(appJs, /0x94a3b8/); // Vacuum halo (Silver Slate)
  // Direct 3D trajectory badges for instant line identification
  assert.match(appJs, /apexTitle = '🌟 真實擊球/);
  assert.match(appJs, /makeTextSprite\(`🔵 僅空氣阻力/);
  assert.match(appJs, /makeTextSprite\(`⚪ 真空無阻力/);
  // Additive blending for luminous bloom
  assert.match(appJs, /AdditiveBlending/);
  // Apex marker and vertical guide
  assert.match(appJs, /最高點/);

  // Authentic MLB field: single seamless master field, infield dirt arc, inner grass diamond
  assert.match(appJs, /masterField/);
  assert.match(appJs, /dirtShape/);
  assert.match(appJs, /innerGrassShape/);
  assert.match(appJs, /outfieldTrack/);
  // Ensure tacky ground decals are removed
  assert.doesNotMatch(appJs, /groundText\('界外 FOUL'\)/);
  assert.doesNotMatch(appJs, /groundText\('界內 FAIR'\)/);
});

