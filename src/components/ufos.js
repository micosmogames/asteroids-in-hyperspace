/* global THREE */

import aframe from 'aframe';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { removeIndex } from '@micosmo/core/object';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const RefSpeed = 0.60; // m/s

aframe.registerComponent("ufos", {
  schema: { default: '' },
  init() {
    this.PlaySpace = this.el.sceneEl.querySelector('#PlaySpace');

    this.thrust = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.thrusterCounters = { visible: 0, invisible: 0 };
    this.ufos = [];
    this.travelProcess = ticker.createProcess(this.traveller.bind(this), this.el);

    onLoadedDo(() => {
      const pools = this.el.sceneEl.querySelector('#Pools').components;
      this.ufoPools = {
        large: pools.mipool__ufo,
        small: pools.mipool__sufo,
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

  newGame() { this.ufos.forEach(el => { this.ufoPools[el.__ufo.pool].returnEntity(el) }) },
  startLevel(cfg, lp) {
    this.travelProcess.restart();
    this.exhaustedPromise = lp;
    if (lp === undefined) { // Hack to remove the code without commenting
      const lcfg = cfg.large;
      for (let i = 0; i < cfg.count; i++) {
        const el = this.asteroidPools.large.requestEntity();
        randomiseVector(el.object3D.position, this.playspaceRadius - 0.1); // Random start position
        randomiseVector(this.v1, this.playspaceRadius / 2);
        this.PlaySpace.object3D.getWorldPosition(this.v2).add(this.v1);
        el.object3D.lookAt(this.v2); // Random direction but facing inwards
        this.asteroids.push(initUfo(this, el, lcfg, 'large'));
        el.object3D.visible = true;
        el.play();
      }
    }
    this.exhaustedPromise.resolve();
  },

  hit(el) {
    const idx = this.ufos.indexOf(el);
    if (idx < 0 || --el.__ufo.hits > 0)
      return;
    removeIndex(this.ufos, idx);
    this.ufoPools[el.__ufo.pool].returnEntity(el);
    if (el.__ufos.length === 0)
      this.exhaustedPromise.resolve()
  },

  traveller(tm, dt) {
    this.ufos.forEach(el => {
      const vPos = el.object3D.position;
      vPos.addScaledVector(el.__ufo.velocity, dt / 1000);
      //      el.object3D.rotateOnAxis(el.__ufo.rotationAxis, el.__ufo.angularSpeed * dt / 1000);
      if (vPos.length() >= this.playspaceRadius) {
        // Loop back in from the other side on the same headng and velocity.
        vPos.negate();
      }
    })
    return 'more';
  },
});

function initUfo(self, el, cfg, pool) {
  if (!el.__ufo) el.__ufo = { velocity: new THREE.Vector3(), rotationAxis: new THREE.Vector3() };
  el.__ufo.velocity.copy(self.zAxis).applyQuaternion(el.object3D.quaternion).setLength(cfg.speed * RefSpeed);
  el.__ufo.hits = cfg.hits;
  //  randomiseVector(el.__ufo.rotationAxis, 1).normalize();
  //  el.__ufo.angularSpeed = cfg.rotation * RefAngularSpeed;
  el.__ufo.pool = pool;
  return el;
}

function randomiseVector(v, length) {
  v.setX(Math.random() * 2 - 1);
  v.setY(Math.random() * 2 - 1);
  v.setZ(Math.random() * 2 - 1);
  v.normalize().setLength(length);
  return v;
}
