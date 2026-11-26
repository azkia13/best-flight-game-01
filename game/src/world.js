// world.js — the Meridian archipelago, built procedurally from one seed.
// One file, one job: islands, mountains, towns, runways, ring courses and
// clouds, plus the terrain height under any point (for terrain collisions).
// Nothing here draws; render.js turns these records into pictures.
import { WORLD_SEED, ISLAND_SPACING, TRACK_LENGTH, RING_RADIUS_FT } from './config.js';

// mulberry32: a tiny deterministic PRNG so the same seed always builds
// the same archipelago — the same world in every screenshot pose.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function nextRandom() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class World {
  constructor(seed = WORLD_SEED) {
    this.seed = seed;
    this.rng = mulberry32(seed);
    this.islands = this.buildIslands();
    this.runways = this.buildRunways();
    this.rings = { rally: this.buildRingCourse(8, 0), storm: this.buildRingCourse(10, 480) };
    this.clouds = this.buildClouds(46);
    this.stormClouds = this.buildClouds(26, true);
    this.mountains = this.buildMountainRidge();
  }

  buildIslands() {
    const islands = [];
    const count = 7;
    for (let i = 0; i < count; i++) {
      const r = this.rng;
      const cx = (i - 3) * ISLAND_SPACING + (r() - 0.5) * 900;
      const cz = 1200 + i * (TRACK_LENGTH / count) + (r() - 0.5) * 700;
      const rx = 700 + r() * 900;
      const rz = 500 + r() * 700;
      islands.push({
        x: cx, z: cz, rx, rz,
        peak: 180 + r() * 620,          // hill height in feet
        town: r() > 0.35,               // a little town with roads
        river: r() > 0.5,               // a river from the peak to the sea
        hue: 0.32 + r() * 0.06,         // green variation
        palms: Math.floor(14 + r() * 26),
        seed: Math.floor(r() * 1e9),
      });
    }
    return islands;
  }

  // Two runways: home base at the start of the track, and a far island
  // strip that Island Hop must reach. Each is a strip along the track.
  buildRunways() {
    return [
      { id: 'home', name: 'Meridian Field', x: 0, z: 400, length: 900, width: 46, heading: 0 },
      { id: 'far', name: 'Coral Bay', x: 620, z: 7600, length: 820, width: 42, heading: 8 },
    ];
  }

  // A ring course snakes along the track: each ring sits a little left or
  // right of the centreline and a little higher or lower than the last,
  // so the pilot must pitch and bank through it, not just fly straight.
  buildRingCourse(count, lateralOffset) {
    const rings = [];
    let x = lateralOffset;
    let alt = 420;
    for (let i = 0; i < count; i++) {
      const z = 900 + i * ((TRACK_LENGTH - 1600) / count);
      x = lateralOffset + Math.sin(i * 0.9) * 620 + (this.rng() - 0.5) * 240;
      alt = 380 + Math.sin(i * 0.7 + 1.2) * 180 + this.rng() * 80;
      rings.push({ x, y: alt, z, radius: RING_RADIUS_FT, passed: false });
    }
    return rings;
  }

  buildClouds(count, storm = false) {
    const clouds = [];
    for (let i = 0; i < count; i++) {
      clouds.push({
        x: (this.rng() - 0.5) * 14000,
        y: storm ? 900 + this.rng() * 700 : 1100 + this.rng() * 900,
        z: this.rng() * 11000,
        scale: storm ? 260 + this.rng() * 420 : 120 + this.rng() * 260,
        dark: storm,
        speed: 6 + this.rng() * 14,
      });
    }
    return clouds;
  }

  // A far ridge of mountain silhouettes for the parallax background.
  buildMountainRidge() {
    const peaks = [];
    for (let i = 0; i < 26; i++) {
      peaks.push({ x: i * 560 - 7000, h: 120 + this.rng() * 260, w: 420 + this.rng() * 300 });
    }
    return peaks;
  }

  // Height of the ground (feet) under world point (x, z): 0 over the sea,
  // a smooth dome over each island, taller near its peak.
  terrainHeightAt(x, z) {
    let h = 0;
    for (const isl of this.islands) {
      const dx = (x - isl.x) / isl.rx;
      const dz = (z - isl.z) / isl.rz;
      const d2 = dx * dx + dz * dz;
      if (d2 < 1) {
        const dome = Math.cos(d2 * Math.PI * 0.5);
        h = Math.max(h, dome * isl.peak);
      }
    }
    return h;
  }

  // Is this point over a runway strip (for landing checks)?
  runwayAt(x, z) {
    for (const rw of this.runways) {
      const dx = Math.abs(x - rw.x);
      const dz = Math.abs(z - rw.z);
      if (dx < rw.width * 0.9 && dz < rw.length / 2) return rw;
    }
    return null;
  }

  // Fresh ring state for a mission (rings are mutated as they are passed).
  freshRings(kind) {
    return this.rings[kind].map((r) => ({ ...r, passed: false }));
  }

  // The next unpassed ring, or null when the course is complete.
  nextRing(rings) {
    return rings.find((r) => !r.passed) || null;
  }

  // How far along the track the plane is, 0..1, for the progress bar.
  trackProgress(z) {
    return Math.max(0, Math.min(1, z / TRACK_LENGTH));
  }
}
