/* global THREE */

import aframe from 'aframe';
import { bindEvent } from "aframe-event-decorators";
import * as ticker from "@micosmo/ticker/aframe-ticker";

const RotateSpeed = THREE.Math.degToRad(90); // In degrees / s

aframe.registerComponent("playspace", {
  schema: { default: '' },
  init() {
    this.sysController = this.el.sceneEl.systems.controller;
    this.sysKeyboard = this.el.sceneEl.systems.keyboard;
    this.sysController.addListeners(this);
    if (!this.el.sceneEl.is('vr-mode'))
      this.sysKeyboard.addListeners(this);

    this.rotationProcess = ticker.createProcess(this.rotater.bind(this), this.el);
    this.rotationRate = 0;

    this.quat = new THREE.Quaternion();
    this.yAxis = new THREE.Vector3(0, 1, 0);
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
    const { x } = evt.detail;
    if (Math.abs(x) <= 0.1) {
      this.rotationProcess.stop();
      return true;
    }
    this.rotationProcess.restart();
    this.rotationRate = x;
    return true;
  },
  keydown_rotleft() { this.rotationProcess.restart(); this.rotationRate = -1; return true },
  keyup_rotleft() { this.rotationProcess.stop(); this.rotationRate = 0; return true },
  keydown_rotright() { this.rotationProcess.restart(); this.rotationRate = 1; return true },
  keyup_rotright() { return this.keyup_rotleft() },
  rotater(tm, dt) {
    const x = this.rotationRate; const absX = Math.abs(x);
    this.quat.setFromAxisAngle(this.yAxis, RotateSpeed * absX * dt / 1000);
    if (x < 0) this.quat.conjugate();
    this.el.object3D.applyQuaternion(this.quat);
    return 'more';
  }
});
