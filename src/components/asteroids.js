/* global THREE */

import aframe from 'aframe';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { removeIndex } from '@micosmo/core/object';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const RefSpeed = 0.20; // m/s
const RefAngularSpeed = THREE.Math.degToRad(180); // Degrees / s
// const Pools = ['large', 'small', 'tiny'];
const Mass = { large: 4, small: 2, tiny: 1 };

aframe.registerComponent("asteroids", {
  schema: { default: '' },
  init() {
    this.PlaySpace = this.el.sceneEl.querySelector('#PlaySpace');

    this.thrust = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.thrusterCounters = { visible: 0, invisible: 0 };
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
  startLevel(cfg, lp) {
    this.cfg = cfg;
    this.travelProcess.restart();
    this.exhaustedPromise = lp;
    const lcfg = cfg.large;
    for (let i = 0; i < lcfg.count; i++) {
      const el = this.asteroidPools.large.requestEntity();
      randomiseVector(el.object3D.position, this.playspaceRadius - 0.01); // Random start position
      randomiseVector(this.v1, this.playspaceRadius / 2);
      this.PlaySpace.object3D.getWorldPosition(this.v2).add(this.v1);
      el.object3D.lookAt(this.v2); // Random direction but facing inwards
      this.asteroids.push(initAsteroid(this, el, lcfg, 'large'));
      el.object3D.visible = true;
      el.play();
    }
  },

  traveller(tm, dt) {
    this.asteroids.forEach(el => {
      const vPos = el.object3D.position;
      vPos.addScaledVector(el.__game.velocity, dt / 1000);
      el.object3D.rotateOnAxis(el.__game.rotationAxis, el.__game.angularSpeed * dt / 1000);
      if (vPos.length() >= this.playspaceRadius) {
        // Loop back in from the other side but randomise the heading
        vPos.negate();
        randomiseVector(this.v1, this.playspaceRadius / 1.5);
        this.PlaySpace.object3D.getWorldPosition(this.v2).add(this.v1);
        el.object3D.lookAt(this.v2); // Random direction but facing inwards
        const speed = el.__game.velocity.length();
        el.__game.velocity.copy(this.zAxis).applyQuaternion(el.object3D.quaternion).setLength(speed);
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
  collision(el1, el2) {
    // Transfer of momentum based calculation where M(Momentum) = v(Velocity) * m(Mass);
    // M1 = v1 * m1; M2 = v2 * m2;
    // New v1 = M2 / m1 & New v2 = M1 / m2;
    const M1 = this.v1.copy(el1.__game.velocity).multiplyScalar(el1.__game.mass);
    const M2 = this.v2.copy(el2.__game.velocity).multiplyScalar(el2.__game.mass);
    el1.__game.velocity.copy(M2).divideScalar(el1.__game.mass);
    el2.__game.velocity.copy(M1).divideScalar(el2.__game.mass);
  }
});

function splitAsteroid(self, targetEl) {
  const pool = targetEl.__game.pool === 'large' ? 'small' : 'tiny'
  const cfg = self.cfg[pool];
  for (let i = cfg.count; i > 0; i--) {
    const el = self.asteroidPools[pool].requestEntity();
    if (el === undefined) return; // Asteroid pool is empty
    el.object3D.position.copy(targetEl.object3D.position);
    randomiseVector(self.v1, self.playspaceRadius - 0.1); // Random direction
    self.PlaySpace.object3D.getWorldPosition(self.v2).add(self.v1);
    el.object3D.lookAt(self.v2); // Random direction facing outwards
    self.asteroids.push(initAsteroid(self, el, cfg, pool));
    el.object3D.visible = true;
    el.play();
  }
}

let IdAsteroid = 0;
function initAsteroid(self, el, cfg, pool) {
  if (!el.__game) el.__game = { velocity: new THREE.Vector3(), rotationAxis: new THREE.Vector3() };
  el.__game.id = ++IdAsteroid;
  el.__game.radius = el.components.collider.data.radius;
  el.__game.velocity.copy(self.zAxis).applyQuaternion(el.object3D.quaternion).setLength(cfg.speed * RefSpeed);
  el.__game.hits = cfg.hits;
  randomiseVector(el.__game.rotationAxis, 1).normalize();
  el.__game.angularSpeed = cfg.rotation * RefAngularSpeed;
  el.__game.pool = pool;
  el.__game.mass = Mass[pool];
  return el;
}

function randomiseVector(v, length) {
  v.setX(Math.random() * 2 - 1);
  v.setY(Math.random() * 2 - 1);
  v.setZ(Math.random() * 2 - 1);
  v.normalize().setLength(length);
  return v;
}
