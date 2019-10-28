/* global THREE */

import aframe from 'aframe';
import { bindEvent } from "aframe-event-decorators";

const RotateMovement = THREE.Math.degToRad(0.25); // In degrees
aframe.registerComponent("playspace", {
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

  rotate_moved(evt) {
    const { x, y } = evt.detail;
    const absX = Math.abs(x); const absY = Math.abs(y);
    if (absX < 0.1 && absY < 0.1)
      return;
    if (absX >= 0.1) {
      this.quat.setFromAxisAngle(this.yAxis, RotateMovement * absX);
      if (x < 0) this.quat.conjugate();
      this.el.object3D.applyQuaternion(this.quat);
    }
    if (absY >= 0.1) {
      this.quat.setFromAxisAngle(this.xAxis, RotateMovement * absY);
      if (y < 0) this.quat.conjugate();
      this.el.object3D.applyQuaternion(this.quat);
    }
    return true;
  },
  keydown_rotup() {
    this.quat.setFromAxisAngle(this.xAxis, RotateMovement);
    this.el.object3D.applyQuaternion(this.quat);
    return true;
  },
  keydown_rotdown() {
    this.quat.setFromAxisAngle(this.xAxis, RotateMovement);
    this.el.object3D.applyQuaternion(this.quat.conjugate());
    return true;
  },
  keydown_rotleft() {
    this.quat.setFromAxisAngle(this.yAxis, RotateMovement);
    this.el.object3D.applyQuaternion(this.quat.conjugate());
    return true;
  },
  keydown_rotright() {
    this.quat.setFromAxisAngle(this.yAxis, RotateMovement);
    this.el.object3D.applyQuaternion(this.quat);
    return true;
  }
});
