// shots.js — deterministic screenshot poses for MERIDIAN RUN.
// One file, one job: read ?shot= from the URL and put the game into a
// fixed, beautiful pose for each named shot. No randomness here: the same
// URL always renders the same frame, so screenshots are reproducible.
import { missionById, Scorecard } from './missions.js';

// The four poses the maker photographs: menu, rally, runway, storm.
export const SHOT_NAMES = ['menu', 'rally', 'runway', 'storm'];

export function shotFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const shot = params.get('shot');
  return SHOT_NAMES.includes(shot) ? shot : null;
}

// Put the live game object into the named pose. Called once at boot when
// ?shot= is present; the game then keeps rendering that pose.
export function applyShot(game, shot) {
  if (shot === 'menu') {
    game.mode = 'menu';
    game.showHelp = false;
    return;
  }
  if (shot === 'rally') {
    game.startMission(1, { silent: true });
    game.mode = 'playing';
    // Mid-rally: three rings already threaded, the fourth dead ahead.
    const plane = game.plane;
    plane.x = 120; plane.z = 2950; plane.alt = 430; plane.heading = 4;
    plane.speed = 132; plane.throttle = 68; plane.fuel = 78;
    game.rings.forEach((r, i) => { if (i < 3) r.passed = true; });
    game.scorecard.ringsPassed = 3;
    game.scorecard.score = 300;
    game.scorecard.timeLeft = 121;
    game.timeS = 38;
    return;
  }
  if (shot === 'runway') {
    game.startMission(2, { silent: true });
    game.mode = 'playing';
    // On final approach: runway lights ahead, gear down, speed on target.
    const plane = game.plane;
    plane.x = 600; plane.z = 7100; plane.alt = 180; plane.heading = 6;
    plane.onGround = false; // airborne on final approach, not on the strip
    plane.pitch = -3; plane.speed = 82; plane.throttle = 34; plane.fuel = 41;
    game.timeS = 96;
    return;
  }
  if (shot === 'storm') {
    game.startMission(3, { silent: true });
    game.mode = 'playing';
    // In the squall: dark clouds, a ring ahead, wind shoving the plane.
    const plane = game.plane;
    plane.x = 700; plane.z = 2300; plane.alt = 480; plane.heading = 8;
    plane.roll = -14; plane.speed = 128; plane.throttle = 72; plane.fuel = 64;
    plane.damage = 34;
    game.rings.forEach((r, i) => { if (i < 2) r.passed = true; });
    game.scorecard.ringsPassed = 2;
    game.scorecard.score = 200;
    game.scorecard.timeLeft = 178;
    game.timeS = 61;
    game.windKt = 22;
    game.renderer.lightning = 0.4;
    return;
  }
}

// A shot pose must look alive but stay still enough to photograph: the
// caller freezes the simulation clock after this returns.
export function isShotPose() {
  return shotFromUrl() !== null;
}
