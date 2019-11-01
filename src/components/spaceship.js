/* global THREE */

import aframe from 'aframe';
import { bindEvent } from "aframe-event-decorators";
import { onLoadedDo } from '@micosmo/aframe/startup';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const MaxPitchYaw = THREE.Math.degToRad(1); // In degrees
const KeyPitchYawFactor = 4;
const MaxSpeed = 1 / 2; // m/s
const Thrust = MaxSpeed * 2 / 3; // m/s/s

aframe.registerComponent("spaceship", {
  schema: { default: '' },
  init() {
    this.sysController = this.el.sceneEl.systems.controller;
    this.sysKeyboard = this.el.sceneEl.systems.keyboard;
    this.sysController.addListeners(this);
    if (!this.el.sceneEl.is('vr-mode'))
      this.sysKeyboard.addListeners(this);

    this.thrust = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.thrustProcess = ticker.createProcess(this.thruster.bind(this), '[spaceship]');
    this.travelProcess = ticker.startProcess(this.traveller.bind(this), '[spaceship]');
    onLoadedDo(() => { this.playspaceRadius = this.el.sceneEl.querySelector('#PlaySpace').components.geometry.data.radius });

    this.quat = new THREE.Quaternion();
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.axis = new THREE.Vector3();
  },
  update(oldData) {
  },
  remove() {
    this.sysController.removeListeners(this);
    this.sysKeyboard.removeListeners(this);
    this.travelProcess.stop();
  },

  'enter-vr': bindEvent({ target: 'a-scene' }, function () { this.sysKeyboard.removeListeners(this) }),
  'exit-vr': bindEvent({ target: 'a-scene' }, function () { this.sysKeyboard.addListeners(this) }),

  pitchyaw_moved(evt) {
    const { x, y } = evt.detail;
    const absX = Math.abs(x); const absY = Math.abs(y);
    if (absX >= 0.1) rotate(this, this.yAxis, x < 0, absX);
    if (absY >= 0.1) rotate(this, this.xAxis, y < 0, absY);
    return true;
  },
  thrust_down() { this.thrustProcess.start(); return true },
  thrust_up() { this.thrustProcess.stop(); return true },
  thruster(tm, dt) {
    this.el.object3D.getWorldDirection(this.thrust).multiplyScalar(Thrust * dt / 1000);
    this.velocity.add(this.thrust);
    if (this.velocity.length() > MaxSpeed)
      this.velocity.normalize().multiplyScalar(MaxSpeed);
    return 'more';
  },
  traveller(tm, dt) {
    const vPos = this.el.object3D.position;
    vPos.addScaledVector(this.velocity, dt / 1000);
    if (vPos.length() > this.playspaceRadius)
      vPos.negate(); // Loop back in from the other side of the playspace
    return 'more';
  },

  keydown_thrust() { if (!this.thrustProcess.isAttached()) this.thrustProcess.start(); return true },
  keyup_thrust() { this.thrustProcess.stop(); return true },
  keydown_pitchup() { return rotate(this, this.xAxis, false, KeyPitchYawFactor) },
  keydown_pitchdown() { return rotate(this, this.xAxis, true, KeyPitchYawFactor) },
  keydown_yawleft() { return rotate(this, this.yAxis, true, KeyPitchYawFactor) },
  keydown_yawright() { return rotate(this, this.yAxis, false, KeyPitchYawFactor) }
});

function rotate(ss, axis, flNegate, factor) {
  ss.axis.copy(axis).applyQuaternion(ss.el.object3D.quaternion);
  ss.quat.setFromAxisAngle(ss.axis, MaxPitchYaw * factor);
  if (flNegate) ss.quat.conjugate();
  ss.el.object3D.applyQuaternion(ss.quat);
  return true;
}
