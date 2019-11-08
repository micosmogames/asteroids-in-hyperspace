/* global THREE */
import aframe from "aframe";
import * as ticker from "@micosmo/ticker/aframe-ticker";

aframe.registerComponent("recenter", {
  schema: {
    offset: { type: "vec3" },
    tuning: { type: 'vec3', default: { x: 0.50, y: 0.50, z: 0.50 } } // Meters / s
  },
  init() {
    this.Camera = this.el.sceneEl.querySelector("[camera]");
    this.sysController = this.el.sceneEl.systems.controller;
    window.recenter = this.around.bind(this);
    this.euler = new THREE.Euler();
    this.offsetFactor = new THREE.Vector3();
    this.currentOffset = new THREE.Vector3();
    this.v1 = new THREE.Vector3();
    this.offsetProcess = ticker.createProcess(this.offseter.bind(this));
  },
  update() {
    this.currentOffset.copy(this.data.offset);
  },
  remove() {
    this.sysController.removeListeners(this);
  },
  start(how) {
    this.sysController.addListeners(this);
  },
  stop() {
    this.sysController.removeListeners(this);
  },
  around(elTgt) {
    const centerEl = elTgt || this.Camera;

    const phi = -this.euler.setFromRotationMatrix(centerEl.object3D.matrix, "YXZ").y;
    const rotation = this.el.object3D.rotation;
    rotation.set(0, phi, 0);
    // console.log(phi);

    this.el.object3D.position
      .copy(centerEl.object3D.position)
      .applyEuler(rotation)
      .negate()
      .add(this.currentOffset);
  },
  xy_moved(evt) {
    const { x, y } = evt.detail;
    const absX = Math.abs(x); const absY = Math.abs(y);
    if (absX < 0.1 && absY < 0.1) {
      this.offsetProcess.stop();
      return true;
    }
    this.offsetProcess.restart();
    this.offsetFactor.set(absX >= 0.1 ? -x : 0, absY >= 0.1 ? y : 0, 0);
    return true;
  },
  zin_down() { this.offsetFactor.set(0, 0, -1); this.offsetProcess.restart(); return true },
  zin_up() { this.offsetProcess.stop(); return true },
  zout_down() { this.offsetFactor.set(0, 0, 1); this.offsetProcess.restart(); return true },
  zout_up() { this.offsetProcess.stop(); return true },
  offseter(tm, dt) {
    const v = this.v1; const data = this.data; dt /= 1000;
    v.copy(this.offsetFactor);
    v.set(data.tuning.x * v.x * dt, data.tuning.y * v.y * dt, data.tuning.z * v.z * dt);
    this.currentOffset.add(v);
    return 'more';
  },
});
