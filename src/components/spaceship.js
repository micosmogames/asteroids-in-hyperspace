/* global THREE */

import aframe from 'aframe';
import { bindEvent } from "aframe-event-decorators";

const MaxPitchYaw = THREE.Math.degToRad(1); // In degrees
const KeyPitchYawFactor = 4;

aframe.registerComponent("spaceship", {
  schema: { default: '' },
  init() {
    this.sysController = this.el.sceneEl.systems.controller;
    this.sysKeyboard = this.el.sceneEl.systems.keyboard;
    this.sysController.addListeners(this);
    if (!this.el.sceneEl.is('vr-mode'))
      this.sysKeyboard.addListeners(this);
    this.quat = new THREE.Quaternion();
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.zAxis = new THREE.Vector3(0, 0, 1);
  },
  update(oldData) {
  },
  remove() {
    this.sysController.removeListeners(this);
    this.sysKeyboard.removeListeners(this);
  },

  'enter-vr': bindEvent({ target: 'a-scene' }, function () { this.sysKeyboard.removeListeners(this) }),
  'exit-vr': bindEvent({ target: 'a-scene' }, function () { this.sysKeyboard.addListeners(this) }),

  pitchyaw_moved(evt) {
    const { x, y } = evt.detail;
    const absX = Math.abs(x); const absY = Math.abs(y);
    if (absX < 0.1 && absY < 0.1)
      return;
    if (absX >= 0.1) {
      this.quat.setFromAxisAngle(this.yAxis, MaxPitchYaw * absX);
      if (x < 0) this.quat.conjugate();
      this.el.object3D.applyQuaternion(this.quat);
    }
    if (absY >= 0.1) {
      this.quat.setFromAxisAngle(this.xAxis, MaxPitchYaw * absY);
      if (y < 0) this.quat.conjugate();
      this.el.object3D.applyQuaternion(this.quat);
    }
    return true;
  },
  thrust_down() {

  },
  thrust_up() {

  },
  keydown_pitchup() {
    this.quat.setFromAxisAngle(this.xAxis, MaxPitchYaw * KeyPitchYawFactor);
    this.el.object3D.applyQuaternion(this.quat);
    return true;
  },
  keydown_pitchdown() {
    this.quat.setFromAxisAngle(this.xAxis, MaxPitchYaw * KeyPitchYawFactor);
    this.el.object3D.applyQuaternion(this.quat.conjugate());
    return true;
  },
  keydown_yawleft() {
    this.quat.setFromAxisAngle(this.yAxis, MaxPitchYaw * KeyPitchYawFactor);
    this.el.object3D.applyQuaternion(this.quat.conjugate());
    return true;
  },
  keydown_yawright() {
    this.quat.setFromAxisAngle(this.yAxis, MaxPitchYaw * KeyPitchYawFactor);
    this.el.object3D.applyQuaternion(this.quat);
    return true;
  }
});
