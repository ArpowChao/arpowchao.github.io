/*
 * TOSS 彈蓋垃圾桶挑戰 — physics model
 * 2D projectile (no air drag) + thin-wall trash can + spring-loaded lid hinged at the back rim.
 * Units: metres, seconds. x to the right (away from the thrower), y up, ground at y = 0.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.TossPhysics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const DEG = Math.PI / 180;
  const DEFAULTS = Object.freeze({
    g: 9.8,
    ballR: 0.06,          // paper ball radius
    releaseX: 0,
    releaseH: 1.0,        // release height h0
    canX: 5,              // horizontal distance to can centre
    canW: 0.5,
    canH: 0.8,
    wallR: 0.015,         // half-thickness of can walls
    lidR: 0.018,          // half-thickness of lid
    lidOverhang: 0.03,
    lidOpenPhi: 1.36,     // rest angle of the open lid (rad, from +x) — leans slightly back
    lidSpeed: 8,         // spring-driven opening angular speed (rad/s)
    eGround: 0.45,
    eCanFloor: 0.2,       // bin bag absorbs most of the bounce
    eWall: 0.45,
    eLid: 0.55,
    tangentKeep: 0.85,
    rollDecel: 1.6,
    dt: 1 / 600,
    maxTime: 12
  });

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function makeConfig(o) { return Object.assign({}, DEFAULTS, o || {}); }
  function canEdges(cfg) { return { front: cfg.canX - cfg.canW / 2, back: cfg.canX + cfg.canW / 2 }; }
  function hinge(cfg) { return { x: cfg.canX + cfg.canW / 2, y: cfg.canH + cfg.wallR + cfg.lidR }; }
  function lidLength(cfg) { return cfg.canW + cfg.lidOverhang; }
  function lidTip(cfg, phi) {
    const h = hinge(cfg), L = lidLength(cfg);
    return { x: h.x + L * Math.cos(phi), y: h.y + L * Math.sin(phi) };
  }
  function newLid(cfg, open) {
    return open
      ? { phi: cfg.lidOpenPhi, state: 'open', omega: 0 }
      : { phi: Math.PI, state: 'closed', omega: 0 };
  }
  function updateLid(lid, cfg, dt) {
    if (lid.state !== 'opening') return;
    lid.omega = -cfg.lidSpeed;
    lid.phi -= cfg.lidSpeed * dt;
    if (lid.phi <= cfg.lidOpenPhi) { lid.phi = cfg.lidOpenPhi; lid.state = 'open'; lid.omega = 0; }
  }
  function walls(cfg) {
    const { front, back } = canEdges(cfg);
    return [
      { a: { x: front, y: 0 }, b: { x: front, y: cfg.canH } },
      { a: { x: back, y: 0 }, b: { x: back, y: cfg.canH } }
    ];
  }

  function launch(cfg, angleDeg, speed) {
    const th = angleDeg * DEG;
    return { x: cfg.releaseX, y: cfg.releaseH, vx: speed * Math.cos(th), vy: speed * Math.sin(th), spin: 0 };
  }

  // Ball (circle) vs capsule segment. Pushes the ball out and reflects the relative normal velocity.
  function collideSegment(ball, a, b, rad, e, cfg, surf) {
    const abx = b.x - a.x, aby = b.y - a.y, len2 = abx * abx + aby * aby;
    let s = len2 > 0 ? ((ball.x - a.x) * abx + (ball.y - a.y) * aby) / len2 : 0;
    s = clamp(s, 0, 1);
    const qx = a.x + s * abx, qy = a.y + s * aby;
    const dx = ball.x - qx, dy = ball.y - qy, dist = Math.hypot(dx, dy), minD = cfg.ballR + rad;
    if (dist >= minD) return null;
    let nx, ny;
    if (dist > 1e-9) { nx = dx / dist; ny = dy / dist; }
    else {
      const L = Math.sqrt(len2) || 1; nx = -aby / L; ny = abx / L;
      if (nx * ball.vx + ny * ball.vy > 0) { nx = -nx; ny = -ny; }
    }
    ball.x = qx + nx * minD; ball.y = qy + ny * minD;
    const sv = surf ? surf(qx, qy) : { x: 0, y: 0 };
    const rvx = ball.vx - sv.x, rvy = ball.vy - sv.y, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const tx = rvx - vn * nx, ty = rvy - vn * ny;
      ball.vx = sv.x + tx * cfg.tangentKeep - e * vn * nx;
      ball.vy = sv.y + ty * cfg.tangentKeep - e * vn * ny;
      ball.spin += (tx * ny - ty * nx) * 0.5;
      return { x: qx, y: qy, speed: -vn };
    }
    return { x: qx, y: qy, speed: 0 };
  }

  function createShot(cfg, lid, angleDeg, speed) {
    const ball = launch(cfg, angleDeg, speed);
    return {
      cfg, lid, ball, angle: angleDeg, speed,
      t: 0, lastRec: 0, path: [{ x: ball.x, y: ball.y }],
      ev: { lid: null, lidOpened: null, wall: null, wallHits: 0, firstGround: null, entered: null, apex: ball.y },
      inside: false, done: false
    };
  }

  function stepWorld(sim, dt) {
    const { cfg, lid, ball, ev } = sim;
    updateLid(lid, cfg, dt);
    if (sim.done) return;
    sim.t += dt;

    // exact constant-acceleration update (no air drag)
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt - 0.5 * cfg.g * dt * dt;
    ball.vy -= cfg.g * dt;
    ball.spin *= 0.999;
    if (ball.y > ev.apex) ev.apex = ball.y;

    const { front, back } = canEdges(cfg);
    const overFloor = ball.x > front && ball.x < back;

    // ground / can floor
    if (ball.y < cfg.ballR) {
      if (ball.vy < 0 && !ev.firstGround) {
        const back = (cfg.ballR - ball.y) / -ball.vy;   // interpolate the actual touchdown inside this step
        ev.firstGround = { x: ball.x - ball.vx * back, t: sim.t - back, inside: overFloor };
      }
      ball.y = cfg.ballR;
      if (ball.vy < 0) {
        ball.vy = -ball.vy * (overFloor ? cfg.eCanFloor : cfg.eGround);
        ball.vx *= cfg.tangentKeep;
        if (ball.vy < 0.35) ball.vy = 0;
      }
    }
    if (ball.y <= cfg.ballR + 1e-9 && ball.vy === 0) {
      const dv = cfg.rollDecel * dt;
      ball.vx = Math.abs(ball.vx) <= dv ? 0 : ball.vx - Math.sign(ball.vx) * dv;
      ball.spin = -ball.vx / cfg.ballR;
    }

    // can walls
    for (const w of walls(cfg)) {
      const c = collideSegment(ball, w.a, w.b, cfg.wallR, cfg.eWall, cfg);
      if (c && c.speed > 0.15) {
        ev.wallHits++;
        if (!ev.wall && !sim.inside && !ev.firstGround) ev.wall = { x: c.x, y: c.y, t: sim.t };
      }
    }

    // lid (can be moving while it springs open)
    const h = hinge(cfg), tip = lidTip(cfg, lid.phi), om = lid.omega;
    const surf = (px, py) => ({ x: -om * (py - h.y), y: om * (px - h.x) });
    const c = collideSegment(ball, h, tip, cfg.lidR, cfg.eLid, cfg, surf);
    if (c) {
      if (!ev.lid) ev.lid = { x: c.x, y: c.y, t: sim.t, stateBefore: lid.state };
      if (lid.state === 'closed') {
        lid.state = 'opening'; lid.omega = -cfg.lidSpeed;
        ev.lidOpened = { x: c.x, y: c.y, t: sim.t };
      }
    }

    // inside the can?
    const inner = ball.x > front + cfg.wallR + cfg.ballR * 0.2 && ball.x < back - cfg.wallR - cfg.ballR * 0.2;
    sim.inside = inner && ball.y < cfg.canH - cfg.ballR * 0.5;
    if (sim.inside && !ev.entered) ev.entered = { t: sim.t };

    if (sim.t - sim.lastRec >= 1 / 120) { sim.path.push({ x: ball.x, y: ball.y }); sim.lastRec = sim.t; }

    const sp = Math.hypot(ball.vx, ball.vy);
    const resting = ball.y <= cfg.ballR + 1e-6 && sp < 0.03;
    if ((sim.inside && ev.entered && sim.t - ev.entered.t > 1.2) || resting ||
        ball.x < cfg.releaseX - 4 || ball.x > cfg.canX + 25 || sim.t > cfg.maxTime) {
      sim.done = true;
      sim.path.push({ x: ball.x, y: ball.y });
    }
  }

  function outcome(sim) {
    const ev = sim.ev;
    let kind;
    if (sim.inside) kind = 'in';
    else if (ev.lidOpened) kind = 'lidOpened';
    else if (ev.entered) kind = 'bounceOut';
    else if (ev.lid) kind = 'lid';
    else if (ev.wall) kind = 'wall';
    else kind = 'ground';
    return {
      kind,
      lidOpened: !!ev.lidOpened,
      landX: ev.firstGround ? ev.firstGround.x : null,
      apex: ev.apex,
      heightAtFront: heightAtX(sim.cfg, sim.angle, sim.speed, canEdges(sim.cfg).front)
    };
  }

  function simulateShot(cfg, lid, angleDeg, speed) {
    const sim = createShot(cfg, lid, angleDeg, speed);
    let n = 0;
    while (!sim.done && n++ < 1e6) stepWorld(sim, cfg.dt);
    return { sim, result: outcome(sim) };
  }

  // ---------- analytic helpers (ideal parabola, ignores collisions) ----------
  function heightAtX(cfg, angleDeg, speed, x) {
    const th = angleDeg * DEG, vx = speed * Math.cos(th);
    if (vx <= 1e-9) return null;
    const t = (x - cfg.releaseX) / vx;
    if (t < 0) return null;
    return cfg.releaseH + speed * Math.sin(th) * t - 0.5 * cfg.g * t * t;
  }
  // speed needed for the ball centre to pass through (x, y) at elevation angleDeg
  function requiredSpeed(cfg, angleDeg, x, y) {
    const th = angleDeg * DEG, dx = x - cfg.releaseX, dy = y - cfg.releaseH;
    const denom = 2 * Math.cos(th) ** 2 * (dx * Math.tan(th) - dy);
    if (!(denom > 0)) return null;
    return Math.sqrt(cfg.g * dx * dx / denom);
  }
  // x where the ball centre comes down to height yLevel
  function landingX(cfg, angleDeg, speed, yLevel) {
    const th = angleDeg * DEG, vx = speed * Math.cos(th), vy = speed * Math.sin(th);
    const dy = cfg.releaseH - (yLevel == null ? cfg.ballR : yLevel);
    const disc = vy * vy + 2 * cfg.g * dy;
    if (disc < 0) return null;
    const t = (vy + Math.sqrt(disc)) / cfg.g;
    return cfg.releaseX + vx * t;
  }
  function pointAt(cfg, angleDeg, speed, t) {
    const th = angleDeg * DEG;
    return { x: cfg.releaseX + speed * Math.cos(th) * t, y: cfg.releaseH + speed * Math.sin(th) * t - 0.5 * cfg.g * t * t };
  }

  return {
    DEFAULTS, DEG, makeConfig, canEdges, hinge, lidLength, lidTip, newLid, updateLid, walls,
    launch, createShot, stepWorld, outcome, simulateShot,
    heightAtX, requiredSpeed, landingX, pointAt
  };
});
