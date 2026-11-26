// main.js — the game loop and state machine for MERIDIAN RUN.
// One file, one job: own the Game object, wire input + audio + physics +
// world + missions + renderer together, and step the state machine
// (menu → playing → paused → mission-end / crashed → campaign complete).
import { VIEW_W, VIEW_H } from './config.js';
import { AudioEngine } from './audio.js';
import { Input } from './input.js';
import { World } from './world.js';
import { FlightModel, stormWindAt } from './physics.js';
import { MISSIONS, missionById, Scorecard, pilotRankFor, campaignTotal } from './missions.js';
import { Renderer } from './render.js';
import { shotFromUrl, applyShot } from './shots.js';

const BEST_KEY = 'meridian-run-best-score';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.input = new Input(canvas);
    this.audio = new AudioEngine();
    this.world = new World();
    this.plane = new FlightModel(this.world);
    this.renderer = new Renderer(canvas);
    this.mode = 'menu';
    this.showHelp = false;
    this.mission = MISSIONS[0];
    this.scorecard = new Scorecard(this.mission);
    this.scorecards = [null, null, null];
    this.totalScore = 0;
    this.rings = [];
    this.timeS = 0;
    this.windKt = 0;
    this.warnings = [];
    this.particles = [];
    this.burst = null;
    this.crashReason = '';
    this.pilotRank = '';
    this.bestScore = Number(window.localStorage.getItem(BEST_KEY) || 0);
    this.helpRows = Input.controlHelp();
    this.alarmCooldown = 0;
    this.lightningTimer = 4;
    this.frozen = false; // screenshot poses freeze the simulation
    this.input.onFirstGesture = () => this.audio.unlock();
    this.lastTick = performance.now();
    this.shot = shotFromUrl();
  }

  // ---- Mission setup ----

  startMission(id, opts = {}) {
    this.mission = missionById(id);
    this.scorecard = new Scorecard(this.mission);
    this.rings = this.mission.rings ? this.world.freshRings(this.mission.rings) : [];
    this.warnings = [];
    this.particles = [];
    this.burst = null;
    this.crashReason = '';
    this.windKt = 0;
    if (this.mission.start.onRunway) {
      const rw = this.world.runways.find((r) => r.id === this.mission.start.onRunway);
      this.plane.resetOnRunway(rw);
    } else {
      const s = this.mission.start;
      this.plane.resetInAir(s.x, s.z, s.alt, s.heading, s.speed);
    }
    this.mode = 'playing';
    if (!opts.silent) this.audio.playJingle();
  }

  finishMission() {
    const m = this.mission;
    if (m.needsLanding) {
      this.scorecard.addLandingBonus(this.plane.landingQuality);
    } else if (m.timeLimit > 0) {
      this.scorecard.addTimeBonus(this.scorecard.timeLeft);
    }
    this.scorecards[m.id - 1] = this.scorecard;
    this.totalScore = campaignTotal(this.scorecards);
    if (m.id >= 3) this.pilotRank = pilotRankFor(this.totalScore);
    if (this.totalScore > this.bestScore) {
      this.bestScore = this.totalScore;
      window.localStorage.setItem(BEST_KEY, String(this.bestScore));
    }
    this.audio.playJingle();
    this.mode = 'mission-end';
  }

  failMission(reason) {
    this.crashReason = reason || this.plane.crashReason || 'The sortie is over.';
    this.scorecards[this.mission.id - 1] = this.scorecard;
    this.totalScore = campaignTotal(this.scorecards);
    this.audio.thud(true);
    this.renderer.shake = 16;
    this.mode = 'crashed';
  }

  nextAfterEnd() {
    if (this.mission.id >= 3) {
      this.pilotRank = pilotRankFor(this.totalScore);
      this.mode = 'menu';
      this.scorecards = [null, null, null];
      this.totalScore = 0;
      return;
    }
    this.startMission(this.mission.id + 1);
  }

  // ---- Per-frame update ----

  update(dt) {
    this.timeS += dt;
    this.alarmCooldown = Math.max(0, this.alarmCooldown - dt);
    if (this.mode !== 'playing') return;

    const stick = {
      pitch: this.input.pitchAxis(),
      roll: this.input.rollAxis(),
      throttle: this.input.throttleAxis(),
    };
    const airbrake = this.input.airbrakeHeld();
    this.windKt = this.mission.storm ? stormWindAt(this.timeS) : 0;
    this.plane.step(stick, this.windKt, dt, airbrake);

    // Ring threading: score, chime and a burst of light at screen centre.
    for (const ring of this.rings) {
      if (this.plane.checkRing(ring)) {
        this.scorecard.addRing(this.scorecard.timeLeft);
        this.audio.ringChime();
        this.burst = { x: VIEW_W / 2, y: VIEW_H * 0.42, life: 0.7, max: 0.7 };
      }
    }

    // Mission clock.
    if (this.mission.timeLimit > 0) {
      this.scorecard.timeLeft -= dt;
    }

    // Warnings for the HUD, with a throttled alarm beep.
    this.warnings = this.collectWarnings();
    if (this.warnings.length && this.alarmCooldown <= 0) {
      this.audio.alarm(this.plane.stalled ? 'stall' : this.plane.fuel < 25 ? 'fuel' : 'terrain');
      this.alarmCooldown = 1.1;
    }

    // Storm lightning: a flash every few seconds in Storm Run.
    if (this.mission.storm) {
      this.lightningTimer -= dt;
      if (this.lightningTimer <= 0) {
        this.renderer.lightning = 0.85;
        this.lightningTimer = 3 + Math.random() * 5;
      }
    }
    this.renderer.lightning = Math.max(0, this.renderer.lightning - dt * 2.2);
    this.audio.windLoop(this.mission.storm ? 0.8 : 0.15);
    this.audio.engineHum(this.plane.throttle, this.plane.speed);

    // Hard landing shake.
    if (this.plane.landed && this.plane.landingQuality === 'HARD') {
      this.renderer.shake = 10;
    }

    // End conditions.
    if (this.plane.crashed) { this.failMission(); return; }
    if (this.scorecard.isFailed(this.plane)) {
      this.failMission(this.scorecard.timeLeft <= 0 ? 'Out of time — the rings are still waiting.' : this.plane.crashReason);
      return;
    }
    if (this.scorecard.isComplete(this.plane)) { this.finishMission(); return; }
    if (this.plane.landed && !this.mission.needsLanding) {
      this.plane.landed = false; // touch-and-go in a ring mission: keep flying
    }
  }

  collectWarnings() {
    const w = [];
    const p = this.plane;
    if (p.stalled) w.push('STALL');
    if (p.fuel < 25) w.push(p.outOfFuel ? 'NO FUEL — GLIDING' : 'LOW FUEL');
    if (p.damage >= 66) w.push('DAMAGE CRITICAL');
    if (this.mission.storm && Math.abs(this.windKt) > 18) w.push('WIND SHEAR');
    const ground = this.world.terrainHeightAt(p.x, p.z);
    if (!p.onGround && p.alt < ground + 120) w.push('TERRAIN');
    return w;
  }

  // ---- Menu button actions and keyboard shortcuts ----

  handleActions(actions) {
    for (const a of actions) {
      if (a === 'start-campaign') this.startMission(1);
      else if (a === 'start-1') this.startMission(1);
      else if (a === 'start-2') this.startMission(2);
      else if (a === 'start-3') this.startMission(3);
      else if (a === 'how-to') this.showHelp = true;
      else if (a === 'menu') { this.mode = 'menu'; this.showHelp = false; }
      else if (a === 'resume') this.mode = 'playing';
      else if (a === 'restart') this.startMission(this.mission.id);
      else if (a === 'next') this.nextAfterEnd();
    }
  }

  handleKeys() {
    const input = this.input;
    if (input.wasPressed('KeyM')) this.audio.setMuted(!this.audio.isMuted());
    if (input.wasPressed('KeyR') && (this.mode === 'playing' || this.mode === 'paused' || this.mode === 'crashed')) {
      this.startMission(this.mission.id);
    }
    if (input.wasPressed('KeyP')) {
      if (this.mode === 'playing') this.mode = 'paused';
      else if (this.mode === 'paused') this.mode = 'playing';
    }
    if (input.wasPressed('Enter') && this.mode === 'menu' && !this.showHelp) {
      this.startMission(1);
    }
    if (input.wasPressed('Escape')) {
      if (this.mode === 'paused') this.mode = 'playing';
      else if (this.showHelp) this.showHelp = false;
    }
  }

  // The view the renderer reads: one plain object, no hidden state.
  view() {
    return {
      mode: this.mode,
      plane: this.plane,
      world: this.world,
      mission: this.mission,
      scorecard: this.scorecard,
      rings: this.rings,
      timeS: this.timeS,
      warnings: this.warnings,
      particles: this.particles,
      burst: this.burst,
      crashReason: this.crashReason,
      totalScore: this.totalScore,
      pilotRank: this.pilotRank,
      isCampaignEnd: this.mission.id >= 3,
      bestScore: this.bestScore,
      showHelp: this.showHelp,
      helpRows: this.helpRows,
      input: this.input,
    };
  }

  frame(now) {
    const dt = Math.min(0.05, (now - this.lastTick) / 1000);
    this.lastTick = now;
    this.handleKeys();
    const actions = this.input.pollClicks();
    this.handleActions(actions);
    if (!this.frozen) this.update(dt);
    this.renderer.drawFrame(this.ctx, this.view(), dt);
    requestAnimationFrame((t) => this.frame(t));
  }

  start() {
    if (this.shot) {
      applyShot(this, this.shot);
      // Screenshot poses render a frozen, deterministic frame.
      this.frozen = true;
      this.update(0.016);
      this.frozen = true;
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}

// Boot: one canvas, one game, one loop.
const canvas = document.getElementById('game');
const game = new Game(canvas);
window.__meridianGame = game; // play-test hook: the harness reads state here
game.start();
