/* global THREE */

import aframe from 'aframe';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { removeIndex } from '@micosmo/core/object';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const RefSpeed = 0.20; // m/s
const RefAngularSpeed = THREE.Math.degToRad(180); // Degrees / s
// const Pools = ['large', 'small', 'tiny'];

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
    this.travelProcess.stop();
  },

  newGame() { this.asteroids.forEach(el => { this.asteroidPools[el.__asteroid.pool].returnEntity(el) }) },
  startLevel(cfg, lp) {
    this.cfg = cfg;
    this.travelProcess.restart();
    this.exhaustedPromise = lp;
    const lcfg = cfg.large;
    for (let i = 0; i < lcfg.count; i++) {
      const el = this.asteroidPools.large.requestEntity();
      randomiseVector(el.object3D.position, this.playspaceRadius - 0.1); // Random start position
      randomiseVector(this.v1, this.playspaceRadius / 2);
      this.PlaySpace.object3D.getWorldPosition(this.v2).add(this.v1);
      el.object3D.lookAt(this.v2); // Random direction but facing inwards
      this.asteroids.push(initAsteroid(this, el, lcfg, 'large'));
      el.object3D.visible = true;
      el.play();
    }
  },

  hit(el) {
    const idx = this.asteroids.indexOf(el);
    if (idx < 0 || --el.__asteroid.hits > 0)
      return;
    removeIndex(this.asteroids, idx);
    if (el.__asteroid.pool !== 'tiny')
      splitAsteroid(this, el);
    this.asteroidPools[el.__asteroid.pool].returnEntity(el);
    if (this.asteroids.length === 0)
      this.exhaustedPromise.resolve();
  },

  traveller(tm, dt) {
    this.asteroids.forEach(el => {
      const vPos = el.object3D.position;
      vPos.addScaledVector(el.__asteroid.velocity, dt / 1000);
      el.object3D.rotateOnAxis(el.__asteroid.rotationAxis, el.__asteroid.angularSpeed * dt / 1000);
      if (vPos.length() >= this.playspaceRadius) {
        // Loop back in from the other side but randomise the heading
        vPos.negate();
        randomiseVector(this.v1, this.playspaceRadius / 1.5);
        this.PlaySpace.object3D.getWorldPosition(this.v2).add(this.v1);
        el.object3D.lookAt(this.v2); // Random direction but facing inwards
        const speed = el.__asteroid.velocity.length();
        el.__asteroid.velocity.copy(this.zAxis).applyQuaternion(el.object3D.quaternion).setLength(speed);
      }
    })
    return 'more';
  },
});

function splitAsteroid(self, targetEl) {
  const pool = targetEl.__asteroid.pool === 'large' ? 'small' : 'tiny'
  const cfg = self.cfg[pool];
  for (let i = cfg.count; i > 0; i--) {
    const el = self.asteroidPools[pool].requestEntity();
    el.object3D.position.copy(targetEl.object3D.position);
    randomiseVector(self.v1, self.playspaceRadius - 0.1); // Random direction
    self.PlaySpace.object3D.getWorldPosition(self.v2).add(self.v1);
    el.object3D.lookAt(self.v2); // Random direction facing outwards
    self.asteroids.push(initAsteroid(self, el, cfg, pool));
    el.object3D.visible = true;
    el.play();
  }
}

function initAsteroid(self, el, cfg, pool) {
  if (!el.__asteroid) el.__asteroid = { velocity: new THREE.Vector3(), rotationAxis: new THREE.Vector3() };
  el.__asteroid.velocity.copy(self.zAxis).applyQuaternion(el.object3D.quaternion).setLength(cfg.speed * RefSpeed);
  el.__asteroid.hits = cfg.hits;
  randomiseVector(el.__asteroid.rotationAxis, 1).normalize();
  el.__asteroid.angularSpeed = cfg.rotation * RefAngularSpeed;
  el.__asteroid.pool = pool;
  return el;
}

function randomiseVector(v, length) {
  v.setX(Math.random() * 2 - 1);
  v.setY(Math.random() * 2 - 1);
  v.setZ(Math.random() * 2 - 1);
  v.normalize().setLength(length);
  return v;
}
