// physics.js — the flight model for MERIDIAN RUN.
// One file, one job: speed, altitude, heading, pitch, roll, throttle,
// fuel, damage, stall, wind and landing quality. No drawing, no input —
// it takes stick/throttle numbers and a world, and steps the plane.
import {
  MAX_SPEED_KT, STALL_SPEED_KT, TAKEOFF_SPEED_KT, MAX_PITCH_DEG, PITCH_RATE,
  MAX_ROLL_DEG, ROLL_RATE, TURN_RATE, CLIMB_PER_KT, DRAG_COEF, AIRBRAKE_DRAG,
  FUEL_MAX, FUEL_BURN_FULL, FUEL_BURN_IDLE, DAMAGE_MAX, TERRAIN_HIT_DAMAGE,
  GROUND_CLEARANCE_FT, RING_RADIUS_FT, LANDING_PERFECT_VS, LANDING_GOOD_VS,
  LANDING_PERFECT_SPEED, LANDING_MAX_SPEED, STORM_WIND_KT,
} from './config.js';

export class FlightModel {
  constructor(world) {
    this.world = world;
    this.resetOnRunway(world.runways[0]);
  }

  resetOnRunway(runway) {
    this.x = runway.x;
    this.z = runway.z - runway.length / 2 + 60; // at the threshold
    this.alt = 0;
    this.heading = runway.heading;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.throttle = 0;
    this.fuel = FUEL_MAX;
    this.damage = 0;
    this.verticalSpeed = 0; // ft per minute, for landing quality
    this.onGround = true;
    this.stalled = false;
    this.outOfFuel = false;
    this.crashed = false;
    this.crashReason = '';
    this.landed = false;
    this.landingQuality = '';
    this.windPush = 0;
  }

  resetInAir(x, z, alt, heading, speed) {
    this.x = x;
    this.z = z;
    this.alt = alt;
    this.heading = heading;
    this.pitch = 0;
    this.roll = 0;
    this.speed = speed;
    this.throttle = 62;
    this.fuel = FUEL_MAX;
    this.damage = 0;
    this.verticalSpeed = 0;
    this.onGround = false;
    this.stalled = false;
    this.outOfFuel = false;
    this.crashed = false;
    this.crashReason = '';
    this.landed = false;
    this.landingQuality = '';
    this.windPush = 0;
  }

  // One simulation step. stick = {pitch: -1..1, roll: -1..1, throttle: -1..1},
  // windKt = sideways wind this frame, dt in seconds.
  step(stick, windKt, dt, airbrake) {
    if (this.crashed || this.landed) return;
    const prevAlt = this.alt;

    // Throttle lever moves at 45%/s; W/S push it, and it stays where left.
    this.throttle = clamp(this.throttle + stick.throttle * 45 * dt, 0, 100);

    // Speed chases the throttle setting; drag bleeds it when idling, and
    // the airbrake bleeds it much faster. Slow speed makes controls mushy.
    const targetSpeed = (this.throttle / 100) * MAX_SPEED_KT;
    const drag = airbrake ? AIRBRAKE_DRAG : DRAG_COEF;
    this.speed += (targetSpeed - this.speed) * Math.min(1, drag * 0.45 * dt);
    if (this.outOfFuel) this.speed -= 14 * dt; // gliding: speed decays
    this.speed = Math.max(0, this.speed);
    const controlAuthority = clamp(this.speed / 110, 0.25, 1);

    // Pitch and roll follow the stick, scaled by how much air is flowing.
    this.pitch = clamp(this.pitch + stick.pitch * PITCH_RATE * controlAuthority * dt, -MAX_PITCH_DEG, MAX_PITCH_DEG);
    this.roll = clamp(this.roll + stick.roll * ROLL_RATE * controlAuthority * dt, -MAX_ROLL_DEG, MAX_ROLL_DEG);
    // Stick released: the plane gently levels its wings by itself.
    if (stick.roll === 0) this.roll *= Math.max(0, 1 - 1.6 * dt);
    if (stick.pitch === 0) this.pitch *= Math.max(0, 1 - 0.8 * dt);

    // Banking turns the plane; a steep bank at low speed is sluggish.
    const turnEffect = TURN_RATE * (this.speed / 100);
    this.heading = (this.heading + this.roll * turnEffect * dt + 360) % 360;

    // Stall: too slow and the nose drops no matter what the stick says.
    this.stalled = this.speed < STALL_SPEED_KT && !this.onGround;
    if (this.stalled) this.pitch = Math.max(this.pitch - 30 * dt, -18);

    // Altitude follows pitch and speed; on the ground the plane rolls.
    if (this.onGround) {
      if (this.speed >= TAKEOFF_SPEED_KT && this.pitch > 4) {
        this.onGround = false; // rotate!
      }
      this.alt = 0;
    } else {
      const climbRate = Math.sin(this.pitch * Math.PI / 180) * this.speed * CLIMB_PER_KT * 1.9;
      this.alt += climbRate * dt;
      if (this.stalled) this.alt -= 55 * dt; // a stalled wing sinks fast
    }
    this.verticalSpeed = (this.alt - prevAlt) / Math.max(dt, 0.001) * 60;

    // Move forward along the heading, in world units (1 kt ≈ 1.15 units/s here).
    const headingRad = this.heading * Math.PI / 180;
    const forward = this.speed * 1.15 * dt;
    this.x += Math.sin(headingRad) * forward;
    this.z += Math.cos(headingRad) * forward;
    // Sideways wind pushes the whole plane sideways (Storm Run).
    this.windPush = windKt;
    this.x += windKt * 0.55 * dt;

    // Fuel: throttle burns it, idling sips it; empty means glide only.
    const burn = FUEL_BURN_IDLE + (FUEL_BURN_FULL - FUEL_BURN_IDLE) * (this.throttle / 100);
    this.fuel = Math.max(0, this.fuel - burn * dt);
    if (this.fuel <= 0 && !this.outOfFuel) {
      this.outOfFuel = true;
      this.throttle = 0;
    }

    this.checkTerrain();
  }

  checkTerrain() {
    if (this.onGround) return;
    const ground = this.world.terrainHeightAt(this.x, this.z);
    const runway = this.world.runwayAt(this.x, this.z);
    if (this.alt <= GROUND_CLEARANCE_FT) {
      if (runway && this.alt <= 2 && Math.abs(this.verticalSpeed) < 900) {
        this.touchdown(runway);
        return;
      }
      if (this.alt <= 0) {
        this.crash(ground > 2 ? 'You hit the hillside.' : 'You ditched into the sea.');
        return;
      }
    }
    if (ground > 0 && this.alt < ground + GROUND_CLEARANCE_FT) {
      this.damage += TERRAIN_HIT_DAMAGE;
      this.alt = ground + GROUND_CLEARANCE_FT + 4; // scrape and bounce off
      this.speed *= 0.82;
      if (this.damage >= DAMAGE_MAX) this.crash('The airframe gave out after the terrain strikes.');
    }
  }

  // Called when the wheels meet a runway: judge the landing by descent
  // rate and speed, then stop the plane on the strip.
  touchdown(runway) {
    this.landed = true;
    this.onGround = true;
    this.alt = 0;
    const vs = Math.abs(this.verticalSpeed);
    if (vs <= LANDING_PERFECT_VS && this.speed <= LANDING_PERFECT_SPEED) {
      this.landingQuality = 'PERFECT';
    } else if (vs <= LANDING_GOOD_VS && this.speed <= LANDING_MAX_SPEED) {
      this.landingQuality = 'GOOD';
    } else {
      this.landingQuality = 'HARD';
      this.damage += 25;
      if (this.damage >= DAMAGE_MAX) {
        this.landed = false;
        this.crash('The landing was too hard — the gear collapsed.');
      }
    }
  }

  crash(reason) {
    this.crashed = true;
    this.crashReason = reason;
    this.speed = 0;
  }

  // Did the plane just thread this ring? The ring is a torus in the sky:
  // the plane must be close to its centre plane and inside its radius.
  checkRing(ring) {
    if (ring.passed || this.crashed) return false;
    const dx = this.x - ring.x;
    const dy = this.alt - ring.y;
    const dz = this.z - ring.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (dist < RING_RADIUS_FT * 0.85) {
      ring.passed = true;
      return true;
    }
    return false;
  }

  // Distance to a ring, for the "next ring" arrow and the HUD.
  distanceTo(ring) {
    const dx = this.x - ring.x;
    const dy = this.alt - ring.y;
    const dz = this.z - ring.z;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  // Bearing to a ring in degrees, for the compass needle.
  bearingTo(ring) {
    const dx = ring.x - this.x;
    const dz = ring.z - this.z;
    return (Math.atan2(dx, dz) * 180 / Math.PI + 360) % 360;
  }

  // True while the plane is in a survivable landing window over a runway.
  isOnFinal(runway) {
    if (!runway) return false;
    const dz = Math.abs(this.z - runway.z);
    const dx = Math.abs(this.x - runway.x);
    return dz < runway.length && dx < runway.width * 3 && this.alt < 900 && this.alt > 0;
  }

  // Heading error to the runway centreline, for the approach helper.
  runwayHeadingError(runway) {
    let err = runway.heading - this.heading;
    while (err > 180) err -= 360;
    while (err < -180) err += 360;
    return err;
  }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function stormWindAt(timeS) {
  // Gusty crosswind: a slow sine swell with a faster flutter on top.
  return STORM_WIND_KT * (0.6 + 0.4 * Math.sin(timeS * 0.35)) * (0.7 + 0.3 * Math.sin(timeS * 1.7));
}
