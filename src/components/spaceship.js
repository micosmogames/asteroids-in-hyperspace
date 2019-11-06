/* global THREE */

import aframe from 'aframe';
import { bindEvent } from "aframe-event-decorators";
import { onLoadedDo } from '@micosmo/aframe/startup';
import { randomInt } from '@micosmo/core/number';
import { removeIndex } from '@micosmo/core/object';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const MaxPitchYaw = THREE.Math.degToRad(2); // In degrees
const KeyPitchYawFactor = 6;
const MaxSpeed = 0.15; // m/s
const Thrust = MaxSpeed * 2; // m/s/s
const ReverseThrust = Thrust / 4; // m/s/s
const ReverseThrustWait = 250;
const GattlerRoundSpeed = MaxSpeed * 4;
const GattlerRoundAdjustment = 0.00525;
const GattlerRounds = 5;
const TouchAngularRotation = THREE.Math.degToRad(359); // Degrees / s

aframe.registerComponent("spaceship", {
  schema: {
    lives: { default: 3 }
  },
  init() {
    this.sysController = this.el.sceneEl.systems.controller;
    this.sysKeyboard = this.el.sceneEl.systems.keyboard;
    this.PlaySpace = this.el.sceneEl.querySelector('#PlaySpace');
    this.Thruster = this.el.querySelector('#Thruster');
    this.Gattler = this.PlaySpace.querySelector('#Gattler');
    this.sysController.addListeners(this);
    if (!this.el.sceneEl.is('vr-mode'))
      this.sysKeyboard.addListeners(this);

    this.thrust = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.thrusterCounter = 0;
    this.gattlerRounds = [];

    this.trackerProcess = ticker.createProcess(this.tracker.bind(this), this.el);
    this.thrustProcess = ticker.createProcess(this.thruster.bind(this), this.el);
    this.reverseThrustProcess = ticker.createProcess(ticker.iterator(ticker.msWaiter(ReverseThrustWait), this.reverseThruster.bind(this)), this.el);
    this.travelProcess = ticker.createProcess(this.traveller.bind(this), this.el);
    this.gattlerProcess = ticker.createProcess(this.gattler.bind(this), this.el);
    this.gattlerWaiter = ticker.msWaiter(1000 / GattlerRounds);
    this.gattlerRoundsProcess = ticker.createProcess(this.gattlerRoundsTraveller.bind(this), this.el);

    onLoadedDo(() => {
      const sceneEl = this.el.sceneEl;
      this.playspaceRadius = sceneEl.querySelector('#PlaySpace').components.geometry.data.radius;
      this.gattlerRoundPool = sceneEl.querySelector('#Pools').components.mipool__gattler;
      this.LeftTouch = sceneEl.querySelector('#leftHand').components.controller.Touch;
      this.RightTouch = sceneEl.querySelector('#rightHand').components.controller.Touch;
      this.compAsteroids = sceneEl.querySelector('#Asteroids').components.asteroids;
      this.compUfos = sceneEl.querySelector('#Ufos').components.ufos;
    });

    this.quat = new THREE.Quaternion();
    this.qTouch = new THREE.Quaternion();
    this.vTouch = new THREE.Vector3();
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.axis = new THREE.Vector3();
    this.v1 = new THREE.Vector3();
  },
  update(oldData) {
  },
  remove() {
    this.sysController.removeListeners(this);
    this.sysKeyboard.removeListeners(this);
    stopProcesses(this);
    this.trackerProcess.stop();
  },

  newGame() {
    stopProcesses(this);
    this.el.object3D.position.set(0, 0, 0); // Initial position
    this.el.object3D.quaternion.set(0, 0, 0, 1); // Initial rotation
  },
  startLevel() {
    stopProcesses(this);
    this.gattlerRounds.forEach(el => { this.gattlerRoundPool.returnEntity(el) });
    this.gattlerRounds.length = 0;
    this.velocity.set(0, 0, 0);
    this.thrusterCounter = 0;
  },

  'enter-vr': bindEvent({ target: 'a-scene' }, function () {
    onLoadedDo(() => {
      this.Touch = this.RightTouch;
      this.trackerProcess.start();
    });
    this.sysKeyboard.removeListeners(this);
  }),
  'exit-vr': bindEvent({ target: 'a-scene' }, function () {
    this.trackerProcess.stop();
    this.Touch = undefined;
    this.sysKeyboard.addListeners(this);
  }),

  collisionstart: bindEvent(function (evt) {
    this[`collision_${evt.detail.layer1}_${evt.detail.layer2}`](evt.detail.el1, evt.detail.el2);
  }),
  collision_gattler_asteroid(elRound, elAsteroid) {
    const idx = this.gattlerRounds.indexOf(elRound);
    if (idx >= 0) destroyGattlerRound(this, elRound, idx);
    this.compAsteroids.hit(elAsteroid);
  },

  thrust_down() { return this.keydown_thrust() },
  thrust_up() { return this.keyup_thrust() },
  keydown_thrust() {
    if (!this.thrustProcess.isAttached()) {
      this.reverseThrustProcess.stop();
      this.thrustProcess.start()
      this.travelProcess.restart();
    }
    return true
  },
  keyup_thrust() {
    this.thrustProcess.stop();
    this.reverseThrustRotation = this.el.object3D.quaternion;
    this.reverseThrustProcess.start();
    this.Thruster.object3D.visible = false;
    this.thrusterCounter = 0;
    return true
  },
  thruster(tm, dt) {
    if ((this.thrusterCounter -= dt) <= 0) {
      this.thrusterCounter = randomInt(50, 100);
      this.Thruster.object3D.visible = !this.Thruster.object3D.visible;
    }
    this.thrust.copy(this.zAxis).applyQuaternion(this.el.object3D.quaternion).multiplyScalar(Thrust * dt / 1000);
    this.velocity.add(this.thrust);
    if (this.velocity.length() > MaxSpeed)
      this.velocity.normalize().multiplyScalar(MaxSpeed);
    return 'more';
  },
  reverseThruster(tm, dt) {
    const speed = this.velocity.length();
    if (speed < 0.001) {
      this.velocity.setLength(0);
      this.travelProcess.stop();
      return; // Stop the reverse thruster
    }
    const accel = ReverseThrust * dt / 1000;
    // Slowly degrade our speed if acceleration exceeds the speed.
    this.velocity.setLength(accel > speed ? speed / 2 : speed - accel);
    return 'more';
  },

  tracker(tm, dt) {
    this.quat.copy(this.el.object3D.quaternion);
    this.Touch.object3D.getWorldPosition(this.vTouch);
    this.el.object3D.lookAt(this.vTouch);
    this.qTouch.copy(this.el.object3D.quaternion);
    this.el.object3D.quaternion.copy(this.quat);
    this.el.object3D.quaternion.rotateTowards(this.qTouch, TouchAngularRotation * dt / 1000);
    const speed = this.velocity.length();
    this.velocity.copy(this.zAxis).applyQuaternion(this.el.object3D.quaternion).setLength(speed);
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

  leftTrigger_down() { this.Touch = this.LeftTouch; return this.keydown_trigger() },
  leftTrigger_up() { return this.keyup_trigger() },
  rightTrigger_down() { this.Touch = this.RightTouch; return this.keydown_trigger() },
  rightTrigger_up() { return this.keyup_trigger() },
  keydown_trigger() { this.gattlerProcess.restart(); return true },
  keyup_trigger() { this.gattlerProcess.stop(); return true },
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

  keydown_pitchup() { return rotate(this, this.xAxis, false, KeyPitchYawFactor) },
  keydown_pitchdown() { return rotate(this, this.xAxis, true, KeyPitchYawFactor) },
  keydown_yawleft() { return rotate(this, this.yAxis, true, KeyPitchYawFactor) },
  keydown_yawright() { return rotate(this, this.yAxis, false, KeyPitchYawFactor) }
});

function moveGattlerRound(ss, el, dt) {
  ss.v1.copy(ss.zAxis).applyQuaternion(el.object3D.quaternion).setLength(GattlerRoundSpeed);
  const vPos = el.object3D.position;
  vPos.addScaledVector(ss.v1.negate(), dt / 1000);
  if (el.__ssVelocity.length() > 0)
    vPos.addScaledVector(el.__ssVelocity, dt / 1000);
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
  ss.v1.copy(ss.zAxis).applyQuaternion(ss.el.object3D.quaternion).setLength(GattlerRoundAdjustment);
  el.object3D.position.copy(ss.el.object3D.position).add(ss.v1);
  el.object3D.quaternion.copy(ss.el.object3D.quaternion); el.object3D.applyQuaternion(ss.quat);
  if (!el.__ssVelocity) el.__ssVelocity = new THREE.Vector3();
  el.__ssVelocity.copy(ss.velocity);
  el.object3D.visible = true;
  el.play();
}

function rotate(ss, axis, flNegate, factor) {
  ss.axis.copy(axis).applyQuaternion(ss.el.object3D.quaternion);
  ss.quat.setFromAxisAngle(ss.axis, MaxPitchYaw * factor);
  if (flNegate) ss.quat.conjugate();
  ss.el.object3D.applyQuaternion(ss.quat);
  return true;
}

function stopProcesses(ss) {
  ss.thrustProcess.stop();
  ss.reverseThrustProcess.stop();
  ss.travelProcess.stop();
  ss.gattlerProcess.stop();
  ss.gattlerRoundsProcess.stop();
}
