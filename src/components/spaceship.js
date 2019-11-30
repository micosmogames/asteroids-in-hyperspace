/* global THREE */

import aframe from 'aframe';
import { bindEvent } from "aframe-event-decorators";
import { onLoadedDo } from '@micosmo/aframe/startup';
import { randomInt } from '@micosmo/core/number';
import { removeIndex } from '@micosmo/core/object';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const MaxPitchYaw = THREE.Math.degToRad(2); // In degrees
const KeyPitchYawFactor = 6;
const MaxSpeedPickup = 7.5; // s
const ThrustPickup = 0.50; // s
const MaxSpeed = 0.30; // m/s
// ThrustPickupAcc is used to build up to Thrust so we can satisfy the following expression to determine ThrustPickupAcc.
//    MaxSpeed = 1/2 * ThrustPickupAcc * ThrustPickup^2 + Thrust * (MaxSpeedPickup - ThrustPickup).
// Note: That '1/2 * ThrustPickupAcc * ThrustPickup^2' will give us a velocity at the end of the ThrustPickup interval.
const ThrustPickupAcc = MaxSpeed / (0.5 * ThrustPickup * ThrustPickup + (MaxSpeedPickup - ThrustPickup) * ThrustPickup);
const Thrust = ThrustPickupAcc * ThrustPickup; // m/s/s
const ReverseThrust = Thrust * 0.50; // m/s/s
const ReverseThrustPickup = ThrustPickup * 2; // s
const ReverseThrustPickupAcc = ReverseThrust / ReverseThrustPickup;
const GattlerRoundSpeed = MaxSpeed * 2;
const GattlerRoundAdjustment = 0.00525;
const GattlerRounds = 3;
const TouchAngularRotation = THREE.Math.degToRad(180); // Degrees / s

aframe.registerComponent("spaceship", {
  schema: {
    lives: { default: 3 }
  },
  init() {
    this.sysController = this.el.sceneEl.systems.controller;
    this.sysKeyboard = this.el.sceneEl.systems.keyboard;
    this.GamePointer = this.el.sceneEl.querySelector('#gamePointer');
    this.PlaySpace = this.el.sceneEl.querySelector('#PlaySpace');
    this.Thruster = this.el.querySelector('#Thruster');
    this.Gattler = this.PlaySpace.querySelector('#Gattler');
    this.sysController.addListeners(this);
    if (!this.el.sceneEl.is('vr-mode'))
      this.sysKeyboard.addListeners(this);

    this.vThrust = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.thrusterCounter = 0;
    this.gattlerRounds = [];

    this.trackerProcess = ticker.createProcess(this.tracker.bind(this), this.el);
    this.thrustProcess = ticker.createProcess(this.thruster.bind(this), this.el);
    this.reverseThrustProcess = ticker.createProcess(this.reverseThruster.bind(this), this.el);
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
    this.qGamePtr = new THREE.Quaternion();
    this.vGamePtr = new THREE.Vector3();
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
    this.reset();
    this.trackerProcess.stop();
  },
  reset() {
    stopProcesses(this);
    this.gattlerRounds.forEach(el => { this.gattlerRoundPool.returnEntity(el) });
    this.gattlerRounds.length = 0;
    this.velocity.set(0, 0, 0);
    this.thrusterCounter = 0;
    this.lives = this.data.lives;
  },

  newGame() {
    this.el.object3D.position.set(0, 0, 0); // Initial position
    this.el.object3D.quaternion.set(0, 0, 0, 1); // Initial rotation
  },
  startLevel() {
    this.reset();
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
    this.reverseThrustProcess.start();
    this.Thruster.object3D.visible = false;
    this.thrusterCounter = 0;
    return true
  },
  * thruster(state) {
    const maxSpeedSq = MaxSpeed * MaxSpeed;
    this.thrust = 0; // Thrust takes time to build up
    this.thrustPickupTimer = ThrustPickup;
    for (;;) {
      const dt = state.dt; const sdt = dt / 1000;
      if ((this.thrusterCounter -= dt) <= 0) {
        this.thrusterCounter = randomInt(50, 100);
        this.Thruster.object3D.visible = !this.Thruster.object3D.visible;
      }
      if (this.thrustPickupTimer > 0) {
        this.thrustPickupTimer -= sdt;
        this.thrust = Math.min(Thrust, this.thrust + ThrustPickupAcc * sdt);
      }
      if (this.velocity.lengthSq() < maxSpeedSq) {
        this.vThrust.copy(this.zAxis).applyQuaternion(this.el.object3D.quaternion).multiplyScalar(this.thrust * sdt);
        this.velocity.add(this.vThrust);
        if (this.velocity.lengthSq() > maxSpeedSq)
          this.velocity.setLength(MaxSpeed);
      }
      yield;
    }
  },
  * reverseThruster(state) {
    this.thrust = 0; // Reverse thrust takes time to build up
    this.thrustPickupTimer = ReverseThrustPickup;
    for (;;) {
      const dt = state.dt; const sdt = dt / 1000;
      const speed = this.velocity.length();
      if (speed < 0.0005) {
        this.velocity.setLength(0);
        this.travelProcess.stop();
        return; // Stop the reverse thruster
      }
      if (this.thrustPickupTimer > 0) {
        this.thrustPickupTimer -= sdt;
        this.thrust = Math.min(ReverseThrust, this.thrust + ReverseThrustPickupAcc * sdt);
      }
      const decel = this.thrust * sdt;
      // Slowly degrade our speed if deceleration exceeds the speed.
      this.velocity.setLength(decel > speed ? speed / 2 : speed - decel);
      yield;
    }
  },

  tracker(tm, dt) {
    this.quat.copy(this.el.object3D.quaternion);
    this.GamePointer.object3D.getWorldPosition(this.vGamePtr);
    this.el.object3D.lookAt(this.vGamePtr);
    this.qGamePtr.copy(this.el.object3D.quaternion);
    this.el.object3D.quaternion.copy(this.quat);
    this.el.object3D.quaternion.rotateTowards(this.qGamePtr, TouchAngularRotation * dt / 1000);
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

  collision(el1, el2) {
    this.shooterHit();
  },
  shooterHit() {
    if (--this.lives === 0)
      this.el.sceneEl.components.states.chain('Endgame');
  },

  leftTrigger_down() { this.Touch = this.LeftTouch; this.gattlerProcess.restart(); return true },
  leftTrigger_up() { this.gattlerProcess.stop(); return true },
  rightTrigger_down() { this.Touch = this.RightTouch; this.gattlerProcess.restart(); return true },
  rightTrigger_up() { this.gattlerProcess.stop(); return true },
  triggerDown: bindEvent(function (evt) {
    const el = evt.detail.triggerEl;
    const dist = this.v1.copy(el.object3D.position).sub(this.el.object3D.position).length();
    const travelTime = dist / GattlerRoundSpeed;
    el.object3D.getWorldPosition(this.v1).addScaledVector(el.__game.velocity, travelTime);
    this.el.object3D.lookAt(this.v1);
    this.gattlerProcess.restart();
    return true;
  }),
  triggerUp: bindEvent(function () { this.gattlerProcess.stop(); return true }),
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
  keydown_yawright() { return rotate(this, this.yAxis, false, KeyPitchYawFactor) },

  gattlerHit(elRound) {
    const idx = this.gattlerRounds.indexOf(elRound);
    if (idx >= 0) destroyGattlerRound(this, elRound, idx);
  },
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
  const el = ss.gattlerRoundPool.requestEntity();
  if (el === undefined) return; // Gattler pool is empty
  ss.gattlerRoundsProcess.restart();
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
