/* global THREE */

import aframe from 'aframe';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { removeIndex, removeValue } from '@micosmo/core/object';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const Pools = ['large', 'small'];
const RefSpeed = 0.60; // m/s
const RotationSpeed = THREE.Math.degToRad(90); // Degrees / s
const Mass = { large: 2, small: 1 };

aframe.registerComponent("ufos", {
  schema: { default: '' },
  init() {
    this.PlaySpace = this.el.sceneEl.querySelector('#PlaySpace');

    this.thrust = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.thrusterCounters = { visible: 0, invisible: 0 };
    this.ufos = [];
    this.travelProcess = ticker.createProcess(this.traveller.bind(this), this.el);
    this.launchProcess = ticker.createProcess(this.launcher.bind(this), this.el);

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
    this.reset();
  },
  reset() {
    this.travelProcess.stop();
    this.launchProcess.stop();
    this.ufos.forEach(el => { this.ufoPools[el.__game.pool].returnEntity(el) });
    this.ufos.length = 0;
    this.exhaustedPromise = undefined;
  },

  newGame() { this.reset() },
  startLevel(cfg) {
    this.launchCfg = cfg;
    this.launchProcess.start();
  },
  levelEnding(lp) {
    if (this.ufos.length === 0) {
      this.launchProcess.stop();
      lp.resolve();
    } else
      this.exhaustedPromise = lp;
  },

  * launcher(state) {
    const cfg = this.launchCfg;
    for (var pool of Pools) {
      const time = cfg[pool].timing / 2;
      for (let i = cfg[pool].count; i > 0; i--) {
        const waitTime = Math.random() * time + time; // Random time in seconds between timing & timing / 2.
        yield ticker.sWaiter(waitTime);
        startUfo(this, cfg[pool], pool);
      }
    };
  },

  traveller(tm, dt) {
    this.ufos.forEach(el => {
      if (el.__game.obstacles.length > 0) {
        // Potential function applied to normalised velocity vector and obstacles in sensor range.
        this.v1.set(0, 0, 0);
        el.__game.obstacles.forEach(obstacle => {
          this.v2.copy(el.object3D.position).sub(obstacle.object3D.position);
          const len = this.v2.length() - obstacle.components.collider.data.radius;
          this.v1.add(this.v2.multiplyScalar(1 / (4 * len * len))).normalize();
        });
        this.v2.copy(el.__game.velocity).normalize().add(this.v1).normalize();
        el.__game.velocity.copy(this.v2).setLength(el.__game.speed);
      }

      const vPos = el.object3D.position;
      vPos.addScaledVector(el.__game.velocity, dt / 1000);
      el.object3D.rotateOnAxis(el.__game.rotationAxis, el.__game.angularSpeed * dt / 1000);
      if (vPos.length() >= this.playspaceRadius) {
        // Loop back in from the other side but randomise the heading
        vPos.negate();
        randomiseVector(this.v1, this.playspaceRadius / 1.5);
        this.PlaySpace.object3D.getWorldPosition(this.v2).add(this.v1);
        el.object3D.lookAt(this.v2); // Random direction but facing inwards
        el.__game.velocity.copy(this.zAxis).applyQuaternion(el.object3D.quaternion).setLength(el.__game.speed);
      }
    })
    return 'more';
  },

  gattlerHit(el) {
    const idx = this.ufos.indexOf(el);
    if (idx < 0 || --el.__game.hits > 0)
      return;
    removeIndex(this.ufos, idx);
    this.ufoPools[el.__game.pool].returnEntity(el);
    if (this.ufos.length === 0 && this.exhaustedPromise) {
      this.exhaustedPromise.resolve();
      this.travelProcess.stop();
      this.launchProcess.stop();
      this.exhaustedPromise = undefined;
    }
  },
  startAvoidObstacle(el1, el2) {
    el1.__game.obstacles.push(el2);
  },
  endAvoidObstacle(el1, el2) {
    removeValue(el1.__game.obstacles, el2);
  }
});

function startUfo(self, cfg, pool) {
  self.travelProcess.restart();
  const el = self.ufoPools[pool].requestEntity();
  randomiseVector(el.object3D.position, self.playspaceRadius - 0.1); // Random start position
  randomiseVector(self.v1, self.playspaceRadius / 2);
  self.PlaySpace.object3D.getWorldPosition(self.v2).add(self.v1);
  el.object3D.lookAt(self.v2); // Random direction but facing inwards
  self.ufos.push(initUfo(self, el, cfg, pool));
  el.object3D.visible = true;
  el.play();
}

let IdUfo = 0;
function initUfo(self, el, cfg, pool) {
  if (!el.__game) el.__game = {
    velocity: new THREE.Vector3(),
    rotationAxis: new THREE.Vector3(),
  };
  el.__game.id = ++IdUfo;
  el.__game.speed = cfg.speed * RefSpeed;
  el.__game.velocity.copy(self.zAxis).applyQuaternion(el.object3D.quaternion).setLength(el.__game.speed);
  el.__game.hits = cfg.hits;
  el.__game.accuracy = cfg.accuracy;
  el.__game.rotationAxis = self.yAxis;
  el.__game.angularSpeed = RotationSpeed;
  el.__game.pool = pool;
  el.__game.mass = Mass[pool];
  el.__game.obstacles = [];
  return el;
}

function randomiseVector(v, length) {
  v.setX(Math.random() * 2 - 1);
  v.setY(Math.random() * 2 - 1);
  v.setZ(Math.random() * 2 - 1);
  v.normalize().setLength(length);
  return v;
}
