/* global THREE */

import aframe from 'aframe';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { removeIndex } from '@micosmo/core/object';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const Pools = ['large', 'small'];
const RefSpeed = 0.60; // m/s
const RotationSpeed = THREE.Math.degToRad(90); // Degrees / s
const AvoidTimer = 200; // ms
const Mass = { large: 2, small: 1 };

aframe.registerComponent("ufos", {
  schema: { default: '' },
  init() {
    this.PlaySpace = this.el.sceneEl.querySelector('#PlaySpace');

    this.thrust = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.thrusterCounters = { visible: 0, invisible: 0 };
    this.ufos = [];
    this.avoidingUfos = [];
    this.travelProcess = ticker.createProcess(this.traveller.bind(this), this.el);
    this.launchProcess = ticker.createProcess(this.launcher.bind(this), this.el);
    this.avoidingProcess = ticker.createProcess(this.avoider.bind(this), this.el);

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
    this.reset(); ;
  },
  reset() {
    this.travelProcess.stop();
    this.launchProcess.stop();
    this.avoidingProcess.stop();
    this.ufos.forEach(el => { this.ufoPools[el.__ufo.pool].returnEntity(el) });
    this.ufos.length = 0;
    this.avoidingUfos.length = 0;
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
      const vPos = el.object3D.position;
      vPos.addScaledVector(el.__ufo.velocity, dt / 1000);
      el.object3D.rotateOnAxis(el.__ufo.rotationAxis, el.__ufo.angularSpeed * dt / 1000);
      if (vPos.length() >= this.playspaceRadius) {
        // Loop back in from the other side but randomise the heading
        vPos.negate();
        randomiseVector(this.v1, this.playspaceRadius / 1.5);
        this.PlaySpace.object3D.getWorldPosition(this.v2).add(this.v1);
        el.object3D.lookAt(this.v2); // Random direction but facing inwards
        const speed = el.__ufo.velocity.length();
        el.__ufo.velocity.copy(this.zAxis).applyQuaternion(el.object3D.quaternion).setLength(speed);
      }
    })
    return 'more';
  },
  avoider(tm, dt) {
    for (let i = 0; i < this.avoidingUfos.length;) {
      const el = this.avoidingUfos[i];
      this.v1.copy(el.__ufo.avoidAdjustment).multiplyScalar(dt);
      const speed = el.__ufo.velocity.length();
      el.__ufo.velocity.add(this.v1).setLength(speed);
      if ((el.__ufo.avoidTimer -= dt) <= 0) {
        removeIndex(this.avoidingUfos, i);
        if (this.avoidingUfos.length === 0)
          return;
      } else
        i++;
    }
    return 'more';
  },

  gattlerHit(el) {
    const idx = this.ufos.indexOf(el);
    if (idx < 0 || --el.__ufo.hits > 0)
      return;
    removeIndex(this.ufos, idx);
    this.ufoPools[el.__ufo.pool].returnEntity(el);
    if (this.ufos.length === 0 && this.exhaustedPromise) {
      this.exhaustedPromise.resolve();
      this.travelProcess.stop();
      this.launchProcess.stop();
      this.exhaustedPromise = undefined;
    }
  },
  avoid(el1, el2) {
    // Variation of the momentum based collision for determining a Velcity vector to approach to.
    this.v2.copy(el1.__ufo.velocity).multiplyScalar(el1.__ufo.mass).divideScalar(el2.__ufo.mass);
    this.v1.copy(el2.__ufo.velocity).multiplyScalar(el2.__ufo.mass).divideScalar(el1.__ufo.mass);
    this.v2.setLength(el2.__ufo.velocity.length()); this.v1.setLength(el1.__ufo.velocity.length());
    el1.__ufo.avoidAdjustment.copy(this.v1).sub(el1.__ufo.velocity).divideScalar(AvoidTimer);
    el1.__ufo.avoidTimer = AvoidTimer;
    el2.__ufo.avoidAdjustment.copy(this.v2).sub(el2.__ufo.velocity).divideScalar(AvoidTimer);
    el2.__ufo.avoidTimer = AvoidTimer;
    if (!this.avoidingUfos.includes(el1)) this.avoidingUfos.push(el1);
    if (!this.avoidingUfos.includes(el2)) this.avoidingUfos.push(el2);
    this.avoidingProcess.restart();
  },
  avoidAsteroid(el1, el2) {
    // Variation of the momentum based collision for determining a Velcity vector to approach to.
    this.v1.copy(el2.__asteroid.velocity).setLength(el1.__ufo.velocity.length()); /* .multiplyScalar(el2.__asteroid.mass).divideScalar(el1.__ufo.mass); */
    //    this.v1.setLength(el1.__ufo.velocity.length());
    // el1.__ufo.avoidAdjustment.copy(this.v1).sub(el1.__ufo.velocity).divideScalar(AvoidTimer);
    el1.__ufo.velocity.copy(this.v1);
    el1.__ufo.avoidTimer = AvoidTimer;
    if (!this.avoidingUfos.includes(el1)) this.avoidingUfos.push(el1);
    //    this.avoidingProcess.restart();
  }
});

/*
collision(el1, el2) {
     el1.object3D.getWorldDirection(this.v1);
el2.object3D.getWorldDirection(this.v2);
     const collisionAngle = this.v1.angleTo(this.v2);
     const angle = (Math.PI - collisionAngle) / 2; // Angle to move each
asteroid to separate by 180 degrees
     const invertedAngle = Math.PI * 2 - angle;
     alterDirection(this, el1, angle);
     el1.object3D.getWorldDirection(this.v1);
     if (this.v1.angleTo(this.v2) < collisionAngle) {
       // Need to invert the angle for el1
       alterDirection(this, el1, invertedAngle - angle);
       alterDirection(this, el2, angle);
     } else
       alterDirection(this, el2, invertedAngle);
   } */

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
  if (!el.__ufo) el.__ufo = {
    velocity: new THREE.Vector3(),
    rotationAxis: new THREE.Vector3(),
    avoidAdjustment: new THREE.Vector3()
  };
  el.__ufo.id = ++IdUfo;
  el.__ufo.velocity.copy(self.zAxis).applyQuaternion(el.object3D.quaternion).setLength(cfg.speed * RefSpeed);
  el.__ufo.hits = cfg.hits;
  el.__ufo.accuracy = cfg.accuracy;
  el.__ufo.rotationAxis = self.yAxis;
  el.__ufo.angularSpeed = RotationSpeed;
  el.__ufo.pool = pool;
  el.__ufo.avoidTimer = 0;
  el.__ufo.mass = Mass[pool];
  return el;
}

function randomiseVector(v, length) {
  v.setX(Math.random() * 2 - 1);
  v.setY(Math.random() * 2 - 1);
  v.setZ(Math.random() * 2 - 1);
  v.normalize().setLength(length);
  return v;
}
