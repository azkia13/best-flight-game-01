// render.js — the pseudo-3D renderer for MERIDIAN RUN.
// One file, one job: turn the world, the plane and the game state into
// pictures on a 2D canvas. Sky, sea, islands, rings, runway, the aircraft,
// particles and every screen (menu, HUD, pause, results) live here.
import { VIEW_W, VIEW_H, HORIZON_REST, COLORS, RING_RADIUS_FT } from './config.js';

const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.shake = 0;
    this.lightning = 0;
    this.flashTimer = 0;
  }

  // Project a world point into screen space from the chase camera behind
  // the plane. Returns null when the point is behind the camera.
  project(wx, wy, wz, cam) {
    const dx = wx - cam.x;
    const dz = wz - cam.z;
    const sinH = Math.sin(cam.headingRad);
    const cosH = Math.cos(cam.headingRad);
    const fwd = dx * sinH + dz * cosH;
    if (fwd < 30) return null;
    const lat = dx * cosH - dz * sinH;
    const focal = 620;
    const scale = focal / fwd;
    return {
      x: VIEW_W / 2 + lat * scale,
      y: cam.horizonY - (wy - cam.alt) * scale,
      scale,
      dist: fwd,
    };
  }

  horizonYFor(pitchDeg) {
    return VIEW_H * HORIZON_REST + pitchDeg * 7;
  }

  cameraFor(plane) {
    const headingRad = plane.heading * Math.PI / 180;
    // Chase camera: a little behind and above the plane, looking forward.
    return {
      x: plane.x - Math.sin(headingRad) * 26,
      z: plane.z - Math.cos(headingRad) * 26,
      alt: plane.alt + 6,
      headingRad,
      horizonY: this.horizonYFor(plane.pitch),
    };
  }

  drawSky(ctx, plane, mission, timeS) {
    const storm = mission && mission.storm;
    const horizonY = this.horizonYFor(plane.pitch);
    const grad = ctx.createLinearGradient(0, 0, 0, horizonY + 120);
    if (storm) {
      grad.addColorStop(0, COLORS.stormTop);
      grad.addColorStop(0.7, COLORS.stormLow);
      grad.addColorStop(1, '#6b7280');
    } else {
      grad.addColorStop(0, COLORS.skyTop);
      grad.addColorStop(0.55, COLORS.skyMid);
      grad.addColorStop(1, COLORS.skyLow);
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, VIEW_W, horizonY + 120);
    if (this.lightning > 0) {
      ctx.fillStyle = `rgba(230, 240, 255, ${this.lightning * 0.5})`;
      ctx.fillRect(0, 0, VIEW_W, horizonY + 120);
    }
    if (!storm) this.drawSun(ctx, plane, horizonY);
  }

  drawSun(ctx, plane, horizonY) {
    // The sun hangs off the plane's right shoulder and drifts with heading.
    const sunX = VIEW_W * 0.78 - (plane.heading % 360) * 0.4;
    const sunY = Math.max(60, horizonY - 210);
    const glow = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, 130);
    glow.addColorStop(0, 'rgba(255, 246, 200, 0.95)');
    glow.addColorStop(0.25, 'rgba(255, 220, 130, 0.55)');
    glow.addColorStop(1, 'rgba(255, 220, 130, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 140, sunY - 140, 280, 280);
    ctx.fillStyle = '#fff7d6';
    ctx.beginPath();
    ctx.arc(sunX, sunY, 34, 0, TAU);
    ctx.fill();
  }

  drawMountainRidge(ctx, plane, horizonY, world) {
    // Two parallax ridges: far (slow) and near (faster), sliding with heading.
    const layers = [
      { amp: 46, base: horizonY - 8, color: COLORS.mountainFar, factor: 0.25, alpha: 0.85 },
      { amp: 78, base: horizonY - 2, color: COLORS.mountainNear, factor: 0.5, alpha: 0.9 },
    ];
    for (const layer of layers) {
      ctx.globalAlpha = layer.alpha;
      ctx.fillStyle = layer.color;
      ctx.beginPath();
      ctx.moveTo(0, horizonY + 4);
      for (let sx = 0; sx <= VIEW_W; sx += 16) {
        const wx = sx + plane.heading * 14 * layer.factor + plane.x * 0.02 * layer.factor;
        const y = layer.base - Math.abs(Math.sin(wx * 0.004) * 0.7 + Math.sin(wx * 0.011 + 2) * 0.3) * layer.amp;
        ctx.lineTo(sx, y);
      }
      ctx.lineTo(VIEW_W, horizonY + 4);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawSea(ctx, plane, horizonY, timeS) {
    const grad = ctx.createLinearGradient(0, horizonY, 0, VIEW_H);
    grad.addColorStop(0, COLORS.seaShallow);
    grad.addColorStop(0.25, COLORS.seaDeep);
    grad.addColorStop(1, '#06263f');
    ctx.fillStyle = grad;
    ctx.fillRect(0, horizonY, VIEW_W, VIEW_H - horizonY);
    // Sun glitter: a shimmering path of short dashes on the water.
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = '#ffe9a8';
    for (let i = 0; i < 14; i++) {
      const t = (timeS * 0.5 + i * 0.61) % 1;
      const y = horizonY + 24 + t * (VIEW_H - horizonY - 50);
      const w = 14 + t * 90;
      const x = VIEW_W * 0.72 + Math.sin(i * 2.3 + timeS) * 190 * t;
      ctx.fillRect(x - w / 2, y, w, 2);
    }
    ctx.restore();
  }

  drawClouds(ctx, plane, clouds, horizonY, timeS) {
    const cam = this.cameraFor(plane);
    const drawn = [];
    for (const c of clouds) {
      const p = this.project(c.x, c.y, c.z + timeS * c.speed * 0.2, cam);
      if (!p || p.y > horizonY + 40) continue;
      drawn.push({ ...c, p });
    }
    drawn.sort((a, b) => b.p.dist - a.p.dist);
    for (const c of drawn) {
      const r = Math.max(6, c.scale * c.p.scale * 0.9);
      ctx.fillStyle = c.dark ? 'rgba(38, 44, 60, 0.92)' : 'rgba(255, 255, 255, 0.92)';
      ctx.beginPath();
      ctx.ellipse(c.p.x, c.p.y, r, r * 0.42, 0, 0, TAU);
      ctx.ellipse(c.p.x - r * 0.55, c.p.y + r * 0.1, r * 0.6, r * 0.3, 0, 0, TAU);
      ctx.ellipse(c.p.x + r * 0.55, c.p.y + r * 0.08, r * 0.65, r * 0.32, 0, 0, TAU);
      ctx.fill();
      if (c.dark) {
        ctx.fillStyle = 'rgba(20, 24, 38, 0.55)';
        ctx.beginPath();
        ctx.ellipse(c.p.x, c.p.y + r * 0.22, r * 0.9, r * 0.2, 0, 0, TAU);
        ctx.fill();
      }
    }
  }

  drawIslands(ctx, plane, world, timeS) {
    const cam = this.cameraFor(plane);
    const horizonY = cam.horizonY;
    const list = world.islands
      .map((isl) => ({ isl, p: this.project(isl.x, 0, isl.z, cam) }))
      .filter((o) => o.p && o.p.y > horizonY - 30)
      .sort((a, b) => b.p.dist - a.p.dist);
    for (const { isl, p } of list) {
      const rx = Math.max(4, isl.rx * p.scale * 0.9);
      const ry = Math.max(3, isl.rz * p.scale * 0.45);
      const cy = p.y + ry * 0.25;
      // Beach ring, then grass, then jungle hill shading.
      ctx.fillStyle = COLORS.sand;
      ctx.beginPath(); ctx.ellipse(p.x, cy, rx, ry, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = COLORS.grass;
      ctx.beginPath(); ctx.ellipse(p.x, cy, rx * 0.86, ry * 0.82, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = COLORS.jungle;
      ctx.beginPath(); ctx.ellipse(p.x, cy - ry * 0.18, rx * 0.5, ry * 0.5, 0, 0, TAU); ctx.fill();
      // Peak highlight.
      ctx.fillStyle = 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.ellipse(p.x - rx * 0.12, cy - ry * 0.32, rx * 0.2, ry * 0.16, 0, 0, TAU); ctx.fill();
      if (isl.river) {
        ctx.strokeStyle = COLORS.river;
        ctx.lineWidth = Math.max(1, rx * 0.02);
        ctx.beginPath();
        ctx.moveTo(p.x, cy - ry * 0.2);
        ctx.quadraticCurveTo(p.x + rx * 0.3, cy + ry * 0.1, p.x + rx * 0.55, cy + ry * 0.55);
        ctx.stroke();
      }
      if (isl.town && rx > 40) this.drawTown(ctx, p.x, cy, rx, ry);
      // Palm dots along the beach.
      ctx.fillStyle = '#1d5c2e';
      const prng = mulberry(isl.seed);
      for (let i = 0; i < Math.min(isl.palms, 18); i++) {
        const a = prng() * TAU;
        const px = p.x + Math.cos(a) * rx * 0.8;
        const py = cy + Math.sin(a) * ry * 0.75;
        ctx.beginPath(); ctx.arc(px, py, Math.max(1.2, rx * 0.012), 0, TAU); ctx.fill();
      }
    }
  }

  drawTown(ctx, cx, cy, rx, ry) {
    ctx.fillStyle = COLORS.town;
    for (let i = 0; i < 7; i++) {
      const bx = cx - rx * 0.3 + i * rx * 0.1;
      const by = cy - ry * 0.1 + (i % 2) * ry * 0.12;
      ctx.fillRect(bx, by, Math.max(2, rx * 0.05), Math.max(2, ry * 0.1));
    }
    ctx.strokeStyle = COLORS.road;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx - rx * 0.4, cy + ry * 0.15);
    ctx.lineTo(cx + rx * 0.4, cy + ry * 0.1);
    ctx.stroke();
  }
}

function mulberry(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---- Rings, runway and the aircraft (part of Renderer) ----

Renderer.prototype.drawRings = function drawRings(ctx, plane, rings, timeS) {
  const cam = this.cameraFor(plane);
  const sorted = rings.map((r) => ({ r, p: this.project(r.x, r.y, r.z, cam) }))
    .filter((o) => o.p)
    .sort((a, b) => b.p.dist - a.p.dist);
  for (const { r, p } of sorted) {
    const radius = Math.max(5, r.radius * p.scale * 1.15);
    const next = rings.find((x) => !x.passed) === r;
    const color = r.passed ? COLORS.ringDone : next ? COLORS.ringNext : COLORS.ringGold;
    // Glow halo.
    ctx.save();
    ctx.globalAlpha = 0.35 + 0.15 * Math.sin(timeS * 3 + p.dist * 0.01);
    ctx.strokeStyle = color;
    ctx.lineWidth = radius * 0.28;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius, radius * 0.92, 0, 0, TAU);
    ctx.stroke();
    ctx.restore();
    // Torus body: bright rim with a darker inner edge.
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, radius * 0.09);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius, radius * 0.92, 0, 0, TAU);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, radius * 0.025);
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius * 0.94, radius * 0.86, 0, -0.4, Math.PI * 0.9);
    ctx.stroke();
    if (next) {
      // Pulsing chevron above the next ring so the pilot never hunts.
      const bob = Math.sin(timeS * 4) * 6;
      ctx.fillStyle = COLORS.ringNext;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - radius - 26 + bob);
      ctx.lineTo(p.x - 12, p.y - radius - 44 + bob);
      ctx.lineTo(p.x + 12, p.y - radius - 44 + bob);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#1e3a5f';
      ctx.font = `bold ${Math.max(11, radius * 0.16)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(`${Math.round(p.dist)} ft`, p.x, p.y + radius + 22);
    }
  }
};

Renderer.prototype.drawRunway = function drawRunway(ctx, plane, runway, timeS) {
  const cam = this.cameraFor(plane);
  const half = runway.length / 2;
  const corners = [
    this.project(runway.x - runway.width / 2, 0, runway.z - half, cam),
    this.project(runway.x + runway.width / 2, 0, runway.z - half, cam),
    this.project(runway.x + runway.width / 2, 0, runway.z + half, cam),
    this.project(runway.x - runway.width / 2, 0, runway.z + half, cam),
  ];
  if (corners.some((c) => !c)) return;
  // Keep the strip readable at range: never let it collapse to a hairline.
  const nearW = Math.abs(corners[1].x - corners[0].x);
  if (nearW < 18) {
    const pad = (18 - nearW) / 2;
    corners[0].x -= pad; corners[1].x += pad;
    corners[2].x += pad; corners[3].x -= pad;
  }
  ctx.fillStyle = COLORS.runway;
  ctx.beginPath();
  ctx.moveTo(corners[0].x, corners[0].y);
  corners.slice(1).forEach((c) => ctx.lineTo(c.x, c.y));
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // Centreline dashes.
  ctx.strokeStyle = COLORS.runwayLine;
  ctx.lineWidth = Math.max(1.5, corners[0].scale * 2);
  ctx.setLineDash([18, 14]);
  const c0 = this.project(runway.x, 0, runway.z - half + 40, cam);
  const c1 = this.project(runway.x, 0, runway.z + half - 40, cam);
  if (c0 && c1) {
    ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.stroke();
  }
  ctx.setLineDash([]);
  // Threshold lights: green at the near end, red at the far end, glowing.
  const lamp = (z, color) => {
    const p = this.project(runway.x, 2, z, cam);
    if (!p) return;
    const r = Math.max(3, 7 * p.scale);
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    ctx.beginPath(); ctx.arc(p.x - runway.width / 2 * p.scale * 0.9, p.y, r, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(p.x + runway.width / 2 * p.scale * 0.9, p.y, r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  };
  lamp(runway.z - half + 10, '#37e07a');
  lamp(runway.z + half - 10, '#ff5a4e');
  // Runway name painted near the threshold, clamped on screen.
  const label = this.project(runway.x, 0, runway.z - half + 120, cam);
  if (label && label.scale > 0.05) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold ${Math.max(12, label.scale * 14)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(runway.name.toUpperCase(), label.x, Math.min(label.y - 14, VIEW_H - 24));
  }
};

Renderer.prototype.drawPlane = function drawPlane(ctx, plane, timeS, particles) {
  // The aircraft sits fixed in the chase view; banking and pitch move the
  // world around it, and the plane itself rolls with the stick.
  const cx = VIEW_W / 2;
  const cy = VIEW_H * 0.70;
  const bank = plane.roll * Math.PI / 180;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(bank * 0.9);
  const scale = 1 + Math.min(0.12, plane.speed / 1500);
  ctx.scale(scale, scale);
  // Propeller blur disc (spins faster with throttle).
  const propR = 46;
  const propAlpha = 0.10 + plane.throttle / 100 * 0.14;
  ctx.fillStyle = `rgba(220, 230, 240, ${propAlpha})`;
  ctx.beginPath(); ctx.arc(0, -6, propR, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 3;
  const bladeAngle = timeS * (4 + plane.throttle / 6);
  ctx.beginPath();
  ctx.moveTo(0, -6 - propR * 0.9 * Math.abs(Math.sin(bladeAngle)));
  ctx.lineTo(0, -6 + propR * 0.9 * Math.abs(Math.sin(bladeAngle)));
  ctx.stroke();
  // Main wings (seen from behind, slightly swept).
  ctx.fillStyle = COLORS.planeWing;
  ctx.strokeStyle = COLORS.planeTrim;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-14, 2); ctx.lineTo(-168, 26); ctx.lineTo(-160, 38); ctx.lineTo(-10, 16);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(14, 2); ctx.lineTo(168, 26); ctx.lineTo(160, 38); ctx.lineTo(10, 16);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Wing-tip navigation lights.
  ctx.fillStyle = '#ff4d4d';
  ctx.beginPath(); ctx.arc(-166, 32, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = '#37e07a';
  ctx.beginPath(); ctx.arc(166, 32, 4, 0, TAU); ctx.fill();
  // Tailplane.
  ctx.fillStyle = COLORS.planeWing;
  ctx.beginPath();
  ctx.moveTo(-10, -34); ctx.lineTo(-64, -52); ctx.lineTo(-58, -42); ctx.lineTo(-8, -26);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(10, -34); ctx.lineTo(64, -52); ctx.lineTo(58, -42); ctx.lineTo(8, -26);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  // Fuselage: tapered body with a red cheatline and a glass canopy.
  ctx.fillStyle = COLORS.planeBody;
  ctx.beginPath();
  ctx.moveTo(0, -58);
  ctx.quadraticCurveTo(20, -30, 16, 6);
  ctx.quadraticCurveTo(14, 26, 0, 30);
  ctx.quadraticCurveTo(-14, 26, -16, 6);
  ctx.quadraticCurveTo(-20, -30, 0, -58);
  ctx.fill();
  ctx.strokeStyle = COLORS.planeTrim;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#bfe6ff';
  ctx.beginPath();
  ctx.ellipse(0, -34, 11, 17, 0, 0, TAU);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.beginPath(); ctx.ellipse(-4, -40, 4, 8, -0.3, 0, TAU); ctx.fill();
  // Spinner.
  ctx.fillStyle = '#f6f1e7';
  ctx.beginPath(); ctx.arc(0, -6, 7, 0, TAU); ctx.fill();
  ctx.strokeStyle = COLORS.planeTrim;
  ctx.stroke();
  // Registration on the tail fin.
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 9px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('MERIDIAN', 0, 20);
  ctx.restore();
  // Wingtip smoke when banking hard — thin trails that fade behind.
  if (Math.abs(plane.roll) > 38 && plane.speed > 60) {
    particles.push({ x: cx - Math.sign(plane.roll) * 160, y: cy + 26, life: 0.9, max: 0.9 });
  }
};

Renderer.prototype.drawParticles = function drawParticles(ctx, particles, dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    p.y += 22 * dt;
    p.x -= 8 * dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    const a = (p.life / p.max) * 0.55;
    ctx.fillStyle = `rgba(255,255,255,${a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 + (1 - p.life / p.max) * 14, 0, TAU);
    ctx.fill();
  }
};

Renderer.prototype.drawRingBurst = function drawRingBurst(ctx, burst, dt) {
  if (!burst) return;
  burst.life -= dt;
  const t = 1 - burst.life / burst.max;
  ctx.save();
  ctx.globalAlpha = Math.max(0, 1 - t);
  ctx.strokeStyle = COLORS.ringGold;
  ctx.lineWidth = 5;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const r0 = 20 + t * 130;
    const r1 = 30 + t * 160;
    ctx.beginPath();
    ctx.moveTo(burst.x + Math.cos(a) * r0, burst.y + Math.sin(a) * r0);
    ctx.lineTo(burst.x + Math.cos(a) * r1, burst.y + Math.sin(a) * r1);
    ctx.stroke();
  }
  ctx.restore();
};

// ---- HUD, menus and end screens (part of Renderer) ----

Renderer.prototype.panel = function panel(ctx, x, y, w, h) {
  ctx.fillStyle = COLORS.hudPanel;
  ctx.strokeStyle = 'rgba(140, 200, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
};

Renderer.prototype.drawGauge = function drawGauge(ctx, x, y, r, value, max, label, unit, color) {
  // A lit round gauge with a needle — the instruments should look flown.
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = 'rgba(8, 24, 40, 0.85)';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.fill();
  ctx.strokeStyle = 'rgba(140, 200, 255, 0.5)';
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(0, 0, r, 0, TAU); ctx.stroke();
  const frac = Math.max(0, Math.min(1, value / max));
  ctx.strokeStyle = color;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, 0, r - 7, Math.PI * 0.75, Math.PI * 0.75 + frac * Math.PI * 1.5);
  ctx.stroke();
  const angle = Math.PI * 0.75 + frac * Math.PI * 1.5;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(Math.cos(angle) * (r - 12), Math.sin(angle) * (r - 12));
  ctx.stroke();
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${Math.round(value)}`, 0, 8);
  ctx.fillStyle = 'rgba(234, 246, 255, 0.75)';
  ctx.font = '11px sans-serif';
  ctx.fillText(`${label} ${unit}`, 0, r + 16);
  ctx.restore();
};

Renderer.prototype.drawHud = function drawHud(ctx, view) {
  const { plane, mission, scorecard, rings, warnings, timeS } = view;
  const next = rings ? rings.find((r) => !r.passed) : null;
  // Top bar: mission name, objective, score, timer.
  this.panel(ctx, 16, 14, 1248, 64);
  ctx.fillStyle = COLORS.hudText;
  ctx.textAlign = 'left';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(`MERIDIAN RUN  ·  ${mission.name.toUpperCase()}`, 32, 40);
  ctx.font = '14px sans-serif';
  ctx.fillStyle = 'rgba(234, 246, 255, 0.8)';
  ctx.fillText(mission.objective, 32, 62);
  ctx.textAlign = 'right';
  ctx.font = 'bold 26px sans-serif';
  ctx.fillStyle = '#ffd34d';
  ctx.fillText(`SCORE ${scorecard.score}`, 1248, 42);
  if (mission.timeLimit > 0) {
    const t = Math.max(0, scorecard.timeLeft);
    const mm = Math.floor(t / 60);
    const ss = Math.floor(t % 60).toString().padStart(2, '0');
    ctx.font = 'bold 22px monospace';
    ctx.fillStyle = t < 30 ? COLORS.hudRed : COLORS.hudText;
    ctx.fillText(`${mm}:${ss}`, 1248, 68);
  } else {
    ctx.font = 'bold 15px sans-serif';
    ctx.fillStyle = COLORS.hudText;
    ctx.fillText(`RINGS ${scorecard.ringsPassed}/${mission.ringCount}`, 1248, 68);
  }
  // Instruments row (bottom left): altitude, speed, throttle, fuel.
  this.drawGauge(ctx, 86, 700, 52, plane.alt, 2000, 'ALT', 'ft', '#7cc7ff');
  this.drawGauge(ctx, 216, 700, 52, plane.speed, 200, 'SPD', 'kt', '#7be495');
  this.drawGauge(ctx, 346, 700, 52, plane.throttle, 100, 'THR', '%', '#ffd34d');
  // Fuel gauge with a lamp that turns red when low.
  this.drawGauge(ctx, 476, 700, 52, plane.fuel, 100, 'FUEL', '%', plane.fuel < 25 ? COLORS.hudRed : '#ff9a5c');
  if (plane.fuel < 25 && Math.floor(timeS * 2) % 2 === 0) {
    ctx.fillStyle = COLORS.hudRed;
    ctx.beginPath(); ctx.arc(476, 700 - 62, 7, 0, TAU); ctx.fill();
  }
  // Compass strip (bottom centre): heading with a needle and tick marks.
  this.panel(ctx, 560, 648, 300, 104);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 24px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(`${String(Math.round(plane.heading)).padStart(3, '0')}°`, 710, 690);
  ctx.font = '12px sans-serif';
  ctx.fillStyle = 'rgba(234, 246, 255, 0.75)';
  ctx.fillText('HDG', 710, 708);
  ctx.strokeStyle = 'rgba(234,246,255,0.5)';
  ctx.lineWidth = 2;
  for (let d = -60; d <= 60; d += 15) {
    const hdg = (plane.heading + d + 360) % 360;
    const x = 710 + d * 2.1;
    ctx.beginPath(); ctx.moveTo(x, 726); ctx.lineTo(x, d % 45 === 0 ? 714 : 720); ctx.stroke();
    if (d % 45 === 0) {
      ctx.fillStyle = 'rgba(234,246,255,0.8)';
      ctx.font = '10px sans-serif';
      ctx.fillText(String(Math.round(hdg / 10) % 36).padStart(2, '0'), x, 742);
    }
  }
  // Next-ring needle: bearing to the next ring, red when off-course.
  if (next) {
    let rel = plane.bearingTo(next) - plane.heading;
    while (rel > 180) rel -= 360;
    while (rel < -180) rel += 360;
    ctx.fillStyle = Math.abs(rel) < 20 ? COLORS.hudGreen : COLORS.hudAmber;
    ctx.beginPath();
    ctx.moveTo(710 + Math.max(-130, Math.min(130, rel * 2)), 668);
    ctx.lineTo(710 + Math.max(-130, Math.min(130, rel * 2)) - 7, 656);
    ctx.lineTo(710 + Math.max(-130, Math.min(130, rel * 2)) + 7, 656);
    ctx.closePath(); ctx.fill();
  }
  // Ring progress (bottom right).
  this.panel(ctx, 900, 648, 364, 104);
  ctx.fillStyle = COLORS.hudText;
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'left';
  const total = mission.ringCount || 0;
  const nextText = total && next ? `   ·   NEXT ${Math.round(plane.distanceTo(next))} ft` : '';
  ctx.fillText(total ? `RINGS  ${scorecard.ringsPassed} / ${total}${nextText}` : 'LAND AT CORAL BAY', 920, 678);
  if (total) {
    for (let i = 0; i < total; i++) {
      ctx.fillStyle = i < scorecard.ringsPassed ? COLORS.ringDone : 'rgba(255,255,255,0.25)';
      ctx.beginPath(); ctx.arc(928 + i * 34, 706, 11, 0, TAU); ctx.fill();
      ctx.fillStyle = '#123';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(i + 1), 928 + i * 34, 710);
    }
  } else {
    ctx.fillStyle = 'rgba(234,246,255,0.8)';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('Follow the coast north. Gear down, slow to 70 kt,', 920, 700);
    ctx.fillText('flare gently over the threshold lights.', 920, 720);
  }
  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(234,246,255,0.65)';
  ctx.font = '12px sans-serif';
  ctx.fillText('P pause · R restart · M mute · Space airbrake', 920, 740);
  // Warnings, flashing at the top centre.
  if (warnings.length && Math.floor(timeS * 2.4) % 2 === 0) {
    ctx.fillStyle = COLORS.hudRed;
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(warnings.join('   ·   '), VIEW_W / 2, 118);
  }
  // Damage bar: a slim strip under the top bar, clear of the gauges.
  if (plane.damage > 0) {
    this.panel(ctx, 16, 88, 250, 46);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`DAMAGE  ${Math.round(plane.damage)}%`, 32, 108);
    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(32, 116, 218, 10);
    ctx.fillStyle = plane.damage > 66 ? COLORS.hudRed : COLORS.hudAmber;
    ctx.fillRect(32, 116, 218 * (plane.damage / 100), 10);
  }
};

Renderer.prototype.drawMenuButton = function drawMenuButton(ctx, input, x, y, w, h, label, action, big) {
  const hover = input ? input.hoverButton(x, y, w, h) : false;
  ctx.fillStyle = hover ? '#ffd34d' : 'rgba(10, 32, 54, 0.85)';
  ctx.strokeStyle = hover ? '#fff' : 'rgba(140, 200, 255, 0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 12);
  ctx.fill(); ctx.stroke();
  ctx.fillStyle = hover ? '#123' : COLORS.hudText;
  ctx.font = `bold ${big ? 24 : 18}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x + w / 2, y + h / 2 + (big ? 8 : 6));
  if (input) input.registerButton(x, y, w, h, action, label);
};

Renderer.prototype.drawMenu = function drawMenu(ctx, view) {
  const { input, bestScore, showHelp } = view;
  const grad = ctx.createLinearGradient(0, 0, 0, VIEW_H);
  grad.addColorStop(0, '#123a63');
  grad.addColorStop(0.55, '#3f7fb5');
  grad.addColorStop(1, '#f2c98a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  // Sun + sea backdrop behind the title.
  ctx.fillStyle = 'rgba(255, 240, 200, 0.9)';
  ctx.beginPath(); ctx.arc(1000, 210, 64, 0, TAU); ctx.fill();
  ctx.fillStyle = '#0b4f7a';
  ctx.fillRect(0, 560, VIEW_W, 240);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  for (let i = 0; i < 8; i++) ctx.fillRect(120 + i * 160, 590 + (i % 3) * 40, 120, 3);
  // Title.
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.shadowColor = 'rgba(0,0,0,0.45)';
  ctx.shadowBlur = 18;
  ctx.font = 'bold 84px sans-serif';
  ctx.fillText('MERIDIAN RUN', VIEW_W / 2, 190);
  ctx.font = 'bold 30px sans-serif';
  ctx.fillStyle = '#ffd34d';
  ctx.fillText('— SKY RING RALLY —', VIEW_W / 2, 236);
  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '18px sans-serif';
  ctx.fillText('Three sorties over a tropical archipelago. Thread the rings, mind the fuel, land it soft.', VIEW_W / 2, 272);
  if (bestScore > 0) {
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(`BEST CAMPAIGN SCORE: ${bestScore}`, VIEW_W / 2, 306);
  }
  if (showHelp) {
    this.panel(ctx, 340, 330, 600, 330);
    ctx.fillStyle = COLORS.hudText;
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('HOW TO FLY', VIEW_W / 2, 366);
    ctx.font = '16px sans-serif';
    ctx.textAlign = 'left';
    const rows = view.helpRows;
    rows.forEach((row, i) => {
      ctx.fillStyle = '#ffd34d';
      ctx.fillText(row[0], 380, 396 + i * 27);
      ctx.fillStyle = COLORS.hudText;
      ctx.fillText(row[1], 640, 396 + i * 27);
    });
    ctx.textAlign = 'center';
    this.drawMenuButton(ctx, input, 490, 612, 300, 40, 'BACK', 'menu', false);
    return;
  }
  this.drawMenuButton(ctx, input, 440, 340, 400, 56, 'FLY THE CAMPAIGN', 'start-campaign', true);
  this.drawMenuButton(ctx, input, 440, 412, 400, 50, 'HOW TO FLY', 'how-to', false);
  this.drawMenuButton(ctx, input, 440, 476, 400, 50, 'MISSION 1 — RING RALLY', 'start-1', false);
  this.drawMenuButton(ctx, input, 440, 540, 400, 50, 'MISSION 2 — ISLAND HOP', 'start-2', false);
  this.drawMenuButton(ctx, input, 440, 604, 400, 50, 'MISSION 3 — STORM RUN', 'start-3', false);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = '14px sans-serif';
  ctx.fillText('Keyboard: arrows fly · W/S throttle · Space airbrake · P pause · R restart · M mute', VIEW_W / 2, 700);
};

Renderer.prototype.drawPause = function drawPause(ctx, view) {
  ctx.fillStyle = 'rgba(4, 14, 26, 0.72)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 56px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', VIEW_W / 2, 300);
  ctx.font = '18px sans-serif';
  ctx.fillStyle = 'rgba(234,246,255,0.85)';
  ctx.fillText('The islands will wait. The fuel will not.', VIEW_W / 2, 340);
  this.drawMenuButton(ctx, view.input, 490, 390, 300, 50, 'RESUME', 'resume', false);
  this.drawMenuButton(ctx, view.input, 490, 456, 300, 50, 'RESTART MISSION', 'restart', false);
  this.drawMenuButton(ctx, view.input, 490, 522, 300, 50, 'QUIT TO MENU', 'menu', false);
};

Renderer.prototype.drawMissionEnd = function drawMissionEnd(ctx, view) {
  const { scorecard, mission, totalScore, isCampaignEnd } = view;
  ctx.fillStyle = 'rgba(4, 14, 26, 0.78)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#7be495';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(isCampaignEnd ? 'CAMPAIGN COMPLETE' : `${mission.name.toUpperCase()} COMPLETE`, VIEW_W / 2, 250);
  ctx.fillStyle = '#fff';
  ctx.font = '22px sans-serif';
  ctx.fillText(scorecard.summaryLine(), VIEW_W / 2, 300);
  ctx.fillStyle = '#ffd34d';
  ctx.font = 'bold 30px sans-serif';
  ctx.fillText(`CAMPAIGN TOTAL: ${totalScore}`, VIEW_W / 2, 350);
  if (isCampaignEnd) {
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 26px sans-serif';
    ctx.fillText(`PILOT RANK: ${view.pilotRank}`, VIEW_W / 2, 396);
  }
  this.drawMenuButton(ctx, view.input, 440, 450, 400, 54, isCampaignEnd ? 'FLY AGAIN' : 'NEXT MISSION', 'next', true);
  this.drawMenuButton(ctx, view.input, 440, 520, 400, 50, 'BACK TO MENU', 'menu', false);
};

Renderer.prototype.drawCrash = function drawCrash(ctx, view) {
  ctx.fillStyle = 'rgba(30, 6, 6, 0.8)';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  ctx.fillStyle = '#ff5a4e';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('DOWN — MISSION FAILED', VIEW_W / 2, 300);
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText(view.crashReason || 'The Meridian Sea keeps its pilots.', VIEW_W / 2, 346);
  ctx.fillStyle = 'rgba(234,246,255,0.85)';
  ctx.font = '18px sans-serif';
  ctx.fillText(`Score this sortie: ${view.scorecard.score}   ·   Campaign total: ${view.totalScore}`, VIEW_W / 2, 384);
  this.drawMenuButton(ctx, view.input, 440, 440, 400, 54, 'TRY AGAIN', 'restart', true);
  this.drawMenuButton(ctx, view.input, 440, 510, 400, 50, 'BACK TO MENU', 'menu', false);
};

// The frame: world first, then plane, particles, HUD, then overlays.
Renderer.prototype.drawFrame = function drawFrame(ctx, view, dt) {
  const { plane, world, mission, rings, timeS, particles, burst } = view;
  ctx.save();
  if (this.shake > 0.5) {
    ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    this.shake *= Math.max(0, 1 - dt * 3);
  }
  const horizonY = this.horizonYFor(plane.pitch);
  this.drawSky(ctx, plane, mission, timeS);
  this.drawMountainRidge(ctx, plane, horizonY, world);
  this.drawSea(ctx, plane, horizonY, timeS);
  this.drawIslands(ctx, plane, world, timeS);
  const runways = world.runways;
  for (const rw of runways) this.drawRunway(ctx, plane, rw, timeS);
  if (rings) this.drawRings(ctx, plane, rings, timeS);
  const clouds = mission && mission.storm ? world.stormClouds : world.clouds;
  this.drawClouds(ctx, plane, clouds, horizonY, timeS);
  this.drawParticles(ctx, particles, dt);
  this.drawRingBurst(ctx, burst, dt);
  this.drawPlane(ctx, plane, timeS, particles);
  ctx.restore();
  if (view.mode === 'playing' || view.mode === 'paused') this.drawHud(ctx, view);
  if (view.mode === 'menu') this.drawMenu(ctx, view);
  if (view.mode === 'paused') this.drawPause(ctx, view);
  if (view.mode === 'mission-end') this.drawMissionEnd(ctx, view);
  if (view.mode === 'crashed') this.drawCrash(ctx, view);
};
