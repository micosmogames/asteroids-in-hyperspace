/* global THREE */

import aframe from 'aframe';
import { bindEvent } from "aframe-event-decorators";
import { onLoadedDo } from '@micosmo/aframe/startup';
import { randomInt } from '@micosmo/core/number';
import { removeIndex } from '@micosmo/core/object';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const MaxSpeed = 3 / 4; // m/s
const Thrust = MaxSpeed * 2 / 3; // m/s/s

aframe.registerComponent("asteroids", {
  schema: { default: '' },
  init() {
    this.PlaySpace = this.el.sceneEl.querySelector('#PlaySpace');

    this.thrust = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.thrusterCounters = { visible: 0, invisible: 0 };
    this.gattlerRounds = [];
    this.gattlerRoundAdjustment = 0.035;

    this.thrustProcess = ticker.createProcess({
      name: 'Thruster',
      onTick: this.thruster.bind(this),
      locateTicker: this.el,
      onEnd: () => { this.Thruster.object3D.visible = false; this.thrusterCounters.invisible = this.thrusterCounters.visible = 0 }
    });
    this.travelProcess = ticker.startProcess(this.traveller.bind(this), this.el);
    this.gattlerProcess = ticker.createProcess(this.gattler.bind(this), this.el);
    this.gattlerWaiter = ticker.msWaiter(1000 / 5); // ~ 5 gattler rounds a second
    this.gattlerRoundsProcess = ticker.createProcess(this.gattlerRoundsTraveller.bind(this), this.el);

    onLoadedDo(() => {
      this.playspaceRadius = this.el.sceneEl.querySelector('#PlaySpace').components.geometry.data.radius;
    });

    this.quat = new THREE.Quaternion();
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.axis = new THREE.Vector3();
    this.v1 = new THREE.Vector3();
  },
  update(oldData) {
  },
  remove() {
    this.travelProcess.stop();
  },

  thruster(tm, dt) {
    if (this.Thruster.object3D.visible) {
      if ((this.thrusterCounters.visible -= dt) <= 0) {
        this.Thruster.object3D.visible = false;
        this.thrusterCounters.invisible = randomInt(50, 100);
      }
    } else if ((this.thrusterCounters.invisible -= dt) <= 0) {
      this.Thruster.object3D.visible = true;
      this.thrusterCounters.visible = randomInt(50, 100);
    }
    this.thrust.copy(this.zAxis).applyQuaternion(this.el.object3D.quaternion).multiplyScalar(Thrust * dt / 1000);
    this.velocity.add(this.thrust);
    if (this.velocity.length() > MaxSpeed)
      this.velocity.normalize().multiplyScalar(MaxSpeed);
    return 'more';
  },

  traveller(tm, dt) {
    const vPos = this.el.object3D.position;
    vPos.addScaledVector(this.velocity, dt / 1000);
    if (vPos.length() >= this.playspaceRadius) {
      // Loop back in from the other side of the playspace and head for the center.
      vPos.negate();
      this.PlaySpace.object3D.getWorldPosition(this.v1);
      this.el.object3D.lookAt(this.v1);
      const speed = this.velocity.length();
      this.velocity.copy(this.zAxis).applyQuaternion(this.el.object3D.quaternion).setLength(speed);
    }
    return 'more';
  },

  * gattler() {
    for (; ;) {
      fireGattlerRound(this);
      yield this.gattlerWaiter;
    }
  },

  gattlerRoundsTraveller(tm, dt) {
    const grs = this.gattlerRounds;
    for (let i = 0; i < grs.length; i++) {
      const el = grs[i];
      if (!moveGattlerRound(this, el, dt))
        destroyGattlerRound(this, el, i--);
    }
    return 'more';
  },
});

function moveGattlerRound(ss, el, dt) {
  ss.v1.copy(ss.zAxis).applyQuaternion(el.object3D.quaternion).setLength(MaxSpeed * 1.25);
  const vPos = el.object3D.position;
  vPos.addScaledVector(ss.v1.negate(), dt / 1000);
  return vPos.length() < ss.playspaceRadius;
}

function destroyGattlerRound(ss, el, idx = ss.gattlerRounds.indexOf(el)) {
  if (idx < 0)
    throw new Error(`micosmo:component:spaceship:destroyGattlerRound: Element is not a gattler round`);
  removeIndex(ss.gattlerRounds, idx);
  ss.gattlerRoundPool.returnEntity(el);
  if (ss.gattlerRounds.length === 0)
    ss.gattlerRoundsProcess.stop();
}

function fireGattlerRound(ss) {
  ss.gattlerRoundsProcess.restart();
  const el = ss.gattlerRoundPool.requestEntity();
  ss.gattlerRounds.push(el);
  ss.axis.copy(ss.yAxis).applyQuaternion(ss.el.object3D.quaternion);
  ss.quat.setFromAxisAngle(ss.axis, THREE.Math.degToRad(180));
  ss.v1.copy(ss.zAxis).applyQuaternion(ss.el.object3D.quaternion).setLength(ss.gattlerRoundAdjustment);
  el.object3D.position.copy(ss.el.object3D.position).add(ss.v1);
  el.object3D.quaternion.copy(ss.el.object3D.quaternion); el.object3D.applyQuaternion(ss.quat);
  el.object3D.visible = true;
  el.play();
}
