/* global THREE */

import aframe from 'aframe';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { removeIndex } from '@micosmo/core/object';
import { timeToIntercept } from '../lib/targeting';
import { randomiseVector } from '@micosmo/aframe/lib/utils';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const Mass = { large: 4, small: 2, tiny: 1 };

aframe.registerComponent("asteroids", {
  schema: { default: '' },
  init() {
    this.PlaySpace = this.el.sceneEl.querySelector('#PlaySpace');
    this.Spaceship = this.el.sceneEl.querySelector('#Spaceship');

    this.asteroids = [];
    this.travelProcess = ticker.createProcess(this.traveller.bind(this), this.el);

    onLoadedDo(() => {
      const pools = this.el.sceneEl.querySelector('#Pools').components;
      this.asteroidPools = {
        large: pools.mipool__lasteroid,
        small: pools.mipool__sasteroid,
        tiny: pools.mipool__tasteroid
      };
      this.playspaceRadius = this.el.sceneEl.querySelector('#PlaySpace').components.geometry.data.radius;
      this.spaceshipRadius = this.Spaceship.components.collider.getScaledRadius();
      this.compGame = this.el.sceneEl.querySelector('#Game').components.game;
      this.compSpaceship = this.Spaceship.components.spaceship;
    });

    this.quat = new THREE.Quaternion();
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.axis = new THREE.Vector3();

    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
  },
  update(oldData) {
  },
  remove() {
    this.reset();
  },
  reset() {
    this.travelProcess.stop();
    this.asteroids.forEach(el => { this.asteroidPools[el.__game.pool].returnEntity(el) });
    this.asteroids.length = 0;
  },

  newGame() { this.reset() },
  endGame() { this.reset() },
  startLevel(cfg, lp) {
    this.cfg = cfg;
    this.travelProcess.restart();
    this.exhaustedPromise = lp;
    const lcfg = cfg.large;
    for (let i = 0; i < lcfg.count; i++) {
      const el = this.asteroidPools.large.requestEntity();
      randomiseVector(el.object3D.position, this.playspaceRadius - 0.001); // Random start position
      this.asteroids.push(initAsteroid(this, el, lcfg, 'large'));
      trackSpaceship(this, el);
      el.object3D.visible = true;
      el.play();
    }
  },

  traveller(tm, dt) {
    const sdt = dt / 1000;
    this.asteroids.forEach(el => {
      const game = el.__game;
      const vPos = el.object3D.position;
      if (game.speed < game.maxSpeed && this.compGame.levelTime() > game.minSpeedInterval)
        game.velocity.setLength(game.speed += game.acceleration * sdt); // Accelerate up to max speed
      vPos.addScaledVector(game.velocity, sdt);
      el.object3D.rotateOnAxis(game.rotationAxis, game.angularSpeed * sdt);
      if (!el.object3D.visible) {
        if (vPos.length() < this.playspaceRadius - game.radius / 4)
          el.object3D.visible = true; // Re-entering playspace
      } else if (vPos.length() >= this.playspaceRadius) {
        el.object3D.visible = false; // Leaving the playspace
        // Randomly loop back in from the other side but randomise the heading.
        vPos.setLength(this.playspaceRadius * (1 + 0.75 * Math.random())).negate();
        trackSpaceship(this, el);
      }
    })
    return 'more';
  },

  gattlerHit(el) {
    const idx = this.asteroids.indexOf(el);
    if (idx < 0 || --el.__game.hits > 0)
      return;
    removeIndex(this.asteroids, idx);
    if (el.__game.pool !== 'tiny')
      splitAsteroid(this, el);
    this.asteroidPools[el.__game.pool].returnEntity(el);
    if (this.asteroids.length === 0) {
      this.exhaustedPromise.resolve();
      this.travelProcess.stop();
    }
  },
  shooterHit(el) {
    this.gattlerHit(el);
  },
  collision(el1, el2) {
    // Transfer of momentum based calculation where M(Momentum) = v(Velocity) * m(Mass);
    // M1 = v1 * m1; M2 = v2 * m2;
    // New v1 = M2 / m1 & New v2 = M1 / m2;
    const M1 = this.v1.copy(el1.__game.velocity).multiplyScalar(el1.__game.mass);
    const M2 = this.v2.copy(el2.__game.velocity).multiplyScalar(el2.__game.mass);
    el1.__game.velocity.copy(M2).divideScalar(el1.__game.mass);
    el2.__game.velocity.copy(M1).divideScalar(el2.__game.mass);
    // Make sure speed is within time based min/max range
    clampSpeed(this, el1); clampSpeed(this, el2);
  }
});

function trackSpaceship(self, el) {
  const game = el.__game;
  var tti;
  if (Math.random() <= game.trackAccuracy &&
      (tti = timeToIntercept(el.object3D.position, undefined, self.Spaceship.object3D.position, self.compSpaceship.velocity, game.speed))) {
    // Have an intercept so lookat the interception point to track towards Spaceship
    self.Spaceship.object3D.getWorldPosition(self.v2).addScaledVector(self.compSpaceship.velocity, tti);
  } else {
    randomiseVector(self.v1, self.playspaceRadius * 0.50); // Random direction facing inwards
    self.PlaySpace.object3D.getWorldPosition(self.v2).add(self.v1);
  }
  el.object3D.lookAt(self.v2);
  game.velocity.copy(self.zAxis).applyQuaternion(el.object3D.quaternion).setLength(game.speed);
}

function clampSpeed(self, el, speed = el.__game.velocity.length()) {
  const game = el.__game;
  const levelTime = self.compGame.levelTime();
  var minSpeed = game.minSpeed;
  if (levelTime > game.minSpeedInterval)
    minSpeed = Math.min(game.maxSpeed, minSpeed + (levelTime - game.minSpeedInterval) * game.acceleration);
  game.velocity.setLength(game.speed = Math.max(minSpeed, Math.min(game.maxSpeed, speed)));
}

function splitAsteroid(self, targetEl) {
  const pool = targetEl.__game.pool === 'large' ? 'small' : 'tiny'
  const cfg = self.cfg[pool];
  for (let i = cfg.count; i > 0; i--) {
    const el = self.asteroidPools[pool].requestEntity();
    if (el === undefined) return; // Asteroid pool is empty
    el.object3D.position.copy(targetEl.object3D.position);
    randomiseVector(self.v1, self.playspaceRadius); // Random direction
    self.PlaySpace.object3D.getWorldPosition(self.v2).add(self.v1);
    el.object3D.lookAt(self.v2); // Random direction facing outwards
    self.asteroids.push(initAsteroid(self, el, cfg, pool));
    el.__game.velocity.copy(self.zAxis).applyQuaternion(el.object3D.quaternion).setLength(el.__game.speed);
    el.object3D.visible = true;
    el.play();
  }
}

let IdAsteroid = 0;
function initAsteroid(self, el, cfg, pool) {
  if (!el.__game) el.__game = { velocity: new THREE.Vector3(), rotationAxis: new THREE.Vector3() };
  const game = el.__game;
  game.id = ++IdAsteroid;
  game.radius = el.components.collider.getScaledRadius();
  game.trackAccuracy = cfg.class.accuracy * cfg.aFac;

  game.minSpeed = cfg.class.speeds.min * cfg.sFac; // Class has base speed and config has factor.
  game.maxSpeed = cfg.class.speeds.max * cfg.sFac; // Class has base speed and config has factor.
  game.minSpeedInterval = cfg.class.speedIntervals.min;
  game.acceleration = (game.maxSpeed - game.minSpeed) / cfg.class.speedIntervals.toMax;
  // Start speed of asteroid must be commensurate with the time the level has been active.
  clampSpeed(self, el, game.minSpeed);

  game.hits = cfg.hits;
  randomiseVector(game.rotationAxis);
  game.angularSpeed = THREE.Math.degToRad(cfg.class.rotation * cfg.rFac);
  game.pool = pool;
  game.mass = Mass[pool];
  return el;
}
