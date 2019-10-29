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
    if (absX < 0.1 && absY < 0.1) return;
    if (absX >= 0.1) return rotate(this, this.yAxis, x < 0, absX);
    if (absY >= 0.1) return rotate(this, this.xAxis, y < 0, absY);
    return true;
  },
  keydown_rotup() { return rotate(this, this.xAxis, false) },
  keydown_rotdown() { return rotate(this, this.xAxis, true) },
  keydown_rotleft() { return rotate(this, this.yAxis, true) },
  keydown_rotright() { return rotate(this, this.yAxis, false) },
});

function rotate(ps, axis, flNegate, factor = 1) {
  ps.quat.setFromAxisAngle(axis, RotateMovement * factor);
  if (flNegate) ps.quat.conjugate();
  ps.el.object3D.applyQuaternion(ps.quat);
  return true;
}
