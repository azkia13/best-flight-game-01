// config.js — every tuning constant for MERIDIAN RUN lives here.
// One file, one job: numbers only, no logic. Change a value here and the
// whole game (physics, missions, rendering) follows it.

// Canvas
export const VIEW_W = 1280;
export const VIEW_H = 800;
export const HORIZON_REST = 0.42; // fraction of height where the horizon sits, level flight

// Flight model
export const MAX_SPEED_KT = 185;      // knots at full throttle
export const CRUISE_SPEED_KT = 120;   // knots at 60% throttle
export const STALL_SPEED_KT = 52;     // below this the nose drops
export const TAKEOFF_SPEED_KT = 62;   // rotate speed on a runway
export const MAX_PITCH_DEG = 24;
export const PITCH_RATE = 26;         // deg per second of stick input
export const MAX_ROLL_DEG = 62;
export const ROLL_RATE = 95;          // deg per second of stick input
export const TURN_RATE = 0.42;        // heading deg/s per deg of roll, scaled by speed
export const CLIMB_PER_KT = 0.55;     // ft/s gained per knot of speed at full pitch
export const DRAG_COEF = 0.35;        // how fast speed bleeds when throttle is low
export const AIRBRAKE_DRAG = 2.4;     // extra drag multiplier while Space is held

// Fuel — throttle burns it, idling sips it
export const FUEL_MAX = 100;
export const FUEL_BURN_FULL = 0.55;   // % per second at 100% throttle
export const FUEL_BURN_IDLE = 0.06;   // % per second at 0% throttle

// Damage and terrain
export const DAMAGE_MAX = 100;
export const TERRAIN_HIT_DAMAGE = 34; // one scrape against a hill or the sea
export const GROUND_CLEARANCE_FT = 8; // below this over land/sea counts as a hit

// Rings
export const RING_RADIUS_FT = 95;
export const RING_POINTS = 100;
export const RING_TIME_BONUS = 6;     // seconds added per ring in Ring Rally

// Missions
export const MISSION_1_RINGS = 8;
export const MISSION_1_TIME_S = 170;
export const MISSION_3_RINGS = 10;
export const MISSION_3_TIME_S = 240;
export const STORM_WIND_KT = 26;      // sideways push in Storm Run
export const LANDING_PERFECT_VS = 260; // max vertical speed (ft/min) for a Perfect landing
export const LANDING_GOOD_VS = 520;
export const LANDING_PERFECT_SPEED = 78;
export const LANDING_MAX_SPEED = 105;

// Scoring
export const TIME_BONUS_PER_SEC = 15;
export const PERFECT_LANDING_BONUS = 600;
export const GOOD_LANDING_BONUS = 300;
export const HARD_LANDING_BONUS = 100;

// World
export const WORLD_SEED = 20261126;
export const ISLAND_SPACING = 2600;   // world units between island centres
export const TRACK_LENGTH = 9000;      // world units of the rally track

// Audio — muted by default until the pilot presses a key (browser autoplay rule).
export const AUDIO_MASTER_GAIN = 0.22;
export const ENGINE_BASE_HZ = 62;
export const ENGINE_TOP_HZ = 148;

// Palette notes for the menu and mission-complete jingle.
export const JINGLE_NOTES = [523.25, 659.25, 783.99, 1046.5];
export const COLORS = {
  skyTop: '#1c5f9e',
  skyMid: '#6fb3dd',
  skyLow: '#cfe9f7',
  sunsetTop: '#2b3a6e',
  sunsetLow: '#ff9a5c',
  stormTop: '#232a3d',
  stormLow: '#4a5568',
  seaDeep: '#0b4f7a',
  seaShallow: '#2fa8a0',
  sand: '#f2dd9e',
  grass: '#4da24a',
  jungle: '#2c7a35',
  town: '#e8e0d0',
  road: '#6b6b6b',
  river: '#7cc7e8',
  mountainFar: '#7d9cc4',
  mountainNear: '#4d7a52',
  ringGold: '#ffd34d',
  ringGlow: 'rgba(255, 211, 77, 0.55)',
  ringNext: '#ffe98a',
  ringDone: '#7be495',
  runway: '#3a3f46',
  runwayLine: '#f5f5f0',
  hudPanel: 'rgba(6, 20, 34, 0.72)',
  hudText: '#eaf6ff',
  hudAmber: '#ffb347',
  hudRed: '#ff5a4e',
  hudGreen: '#7be495',
  planeBody: '#e8442e',
  planeWing: '#f6f1e7',
  planeTrim: '#1e3a5f',
};
