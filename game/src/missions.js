// missions.js — the three sorties of the MERIDIAN RUN campaign.
// One file, one job: what each mission asks for, how it scores, and what
// bonus a good landing or leftover time earns. The campaign plays them in
// order and adds the scores into one pilot total.
import {
  MISSION_1_RINGS, MISSION_1_TIME_S, MISSION_3_RINGS, MISSION_3_TIME_S,
  RING_POINTS, TIME_BONUS_PER_SEC, PERFECT_LANDING_BONUS, GOOD_LANDING_BONUS,
  HARD_LANDING_BONUS, RING_TIME_BONUS,
} from './config.js';

export const MISSIONS = [
  {
    id: 1,
    name: 'Ring Rally',
    subtitle: 'Thread all 8 sky rings before the clock runs out',
    objective: 'Fly through 8 rings in order. Each ring: +100 pts and +6s.',
    rings: 'rally',
    ringCount: MISSION_1_RINGS,
    timeLimit: MISSION_1_TIME_S,
    needsLanding: false,
    storm: false,
    start: { x: 0, z: 200, alt: 420, heading: 0, speed: 120 },
    briefing: 'The rally course is live. Rings glow gold — fly through the centre of each one in order. Smooth banks beat hard yanks: slow down to turn tighter.',
  },
  {
    id: 2,
    name: 'Island Hop',
    subtitle: 'Ferry the mail plane to Coral Bay — and land it in one piece',
    objective: 'Take off from Meridian Field, cross the islands, land on Coral Bay runway.',
    rings: null,
    ringCount: 0,
    timeLimit: 0,
    needsLanding: true,
    storm: false,
    targetRunway: 'far',
    start: { onRunway: 'home' },
    briefing: 'Full tanks, short runway. Rotate at 62 knots, climb to 800 feet and follow the coast north. Watch the fuel gauge — a greedy throttle leaves you gliding.',
  },
  {
    id: 3,
    name: 'Storm Run',
    subtitle: 'Ten rings through a squall line — the wind wants you in the sea',
    objective: 'Thread 10 rings in a crosswind. Terrain strikes damage the airframe.',
    rings: 'storm',
    ringCount: MISSION_3_RINGS,
    timeLimit: MISSION_3_TIME_S,
    needsLanding: false,
    storm: true,
    start: { x: 480, z: 200, alt: 460, heading: 0, speed: 125 },
    briefing: 'A squall line sits over the course. Gusts shove the plane sideways — crab into the wind and correct early. One terrain scrape is 34% damage. Three is the end.',
  },
];

export function missionById(id) {
  return MISSIONS.find((m) => m.id === id) || MISSIONS[0];
}

export function pilotRankFor(totalScore) {
  if (totalScore >= 5200) return 'ACE OF THE MERIDIAN';
  if (totalScore >= 4200) return 'Squadron Leader';
  if (totalScore >= 3200) return 'Flight Lieutenant';
  if (totalScore >= 2200) return 'Flying Officer';
  if (totalScore >= 1200) return 'Pilot Officer';
  return 'Cadet';
}

// A fresh per-mission scorecard: rings, time, fuel and landing all feed it.
export class Scorecard {
  constructor(mission) {
    this.mission = mission;
    this.score = 0;
    this.ringsPassed = 0;
    this.timeLeft = mission.timeLimit;
    this.timeBonus = 0;
    this.landingBonus = 0;
    this.ringBonusSeconds = 0;
    this.events = [];
  }

  addRing(timeLeft) {
    this.ringsPassed += 1;
    this.score += RING_POINTS;
    this.timeLeft = Math.min(this.mission.timeLimit, timeLeft + RING_TIME_BONUS);
    this.ringBonusSeconds += RING_TIME_BONUS;
    this.events.push(`Ring ${this.ringsPassed} +${RING_POINTS}`);
    return this.score;
  }

  addTimeBonus(secondsLeft) {
    this.timeBonus = Math.round(secondsLeft) * TIME_BONUS_PER_SEC;
    this.score += this.timeBonus;
    return this.timeBonus;
  }

  addLandingBonus(quality) {
    const bonus = quality === 'PERFECT' ? PERFECT_LANDING_BONUS
      : quality === 'GOOD' ? GOOD_LANDING_BONUS
      : quality === 'HARD' ? HARD_LANDING_BONUS : 0;
    this.landingBonus = bonus;
    this.score += bonus;
    return bonus;
  }

  // Did this mission meet its win condition?
  isComplete(plane) {
    if (this.mission.needsLanding) return plane.landed;
    return this.ringsPassed >= this.mission.ringCount;
  }

  // Did the mission run out of road (timer, fuel + crash, or damage)?
  isFailed(plane) {
    if (plane.crashed) return true;
    if (this.mission.timeLimit > 0 && this.timeLeft <= 0) return true;
    return false;
  }

  // One-line summary for the mission-complete screen.
  summaryLine() {
    const parts = [`${this.ringsPassed}/${this.mission.ringCount} rings`, `${this.score} pts`];
    if (this.timeBonus) parts.push(`time bonus +${this.timeBonus}`);
    if (this.landingBonus) parts.push(`landing +${this.landingBonus}`);
    return parts.join('  ·  ');
  }
}

// Campaign totals across the three sorties.
export function campaignTotal(scorecards) {
  return scorecards.reduce((sum, s) => sum + (s ? s.score : 0), 0);
}
