/* global THREE */
import aframe from "aframe";
import * as ticker from "@micosmo/ticker/aframe-ticker";

aframe.registerComponent("recenter", {
  schema: {
    offset: { type: "vec3" },
    tuning: { type: 'vec3', default: { x: 0.01, y: 0.01, z: 0.01 } }
  },
  init() {
    this.Camera = this.el.sceneEl.querySelector("[camera]");
    this.sysController = this.el.sceneEl.systems.controller;
    window.recenter = this.around.bind(this);
    this.euler = new THREE.Euler();
    this.v3 = new THREE.Vector3();
    this.currentOffset = new THREE.Vector3();
    if (!this.el.getAttribute('ctrlmap'))
      this.el.setAttribute('ctrlmap', 'xy:stick,zin:b,zin:y,zout:a,zout:x'); // Allow stick adjustments to the element being recentered
    const self = this;
    this.offsetProcess = ticker.createProcess(function * zTravel() {
      for (; ;) {
        yield ticker.msWaiter(10);
        self.currentOffset.add(self.v3.set(0, 0, self._zAdjust));
      }
    });
  },
  update() {
    this.currentOffset.copy(this.data.offset);
  },
  remove() {
    this.sysController.removeListeners(this);
  },
  start(how) {
    if (how === 'controller') this.sysController.addListeners(this);
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
    if (absX < 0.1 && absY < 0.1)
      return true;
    this.v3.set(absX >= 0.1 ? this.data.tuning.x * x : 0, absY >= 0.1 ? this.data.tuning.y * y : 0, 0);
    this.currentOffset.add(this.v3);
    return true;
  },
  zin_down() {
    this._zAdjust = -this.data.tuning.z;
    if (!this.offsetProcess.isAttached())
      this.offsetProcess.start();
    return true;
  },
  zin_up() {
    this.offsetProcess.stop();
    return true;
  },
  zout_down() {
    this._zAdjust = this.data.tuning.z;
    if (!this.offsetProcess.isAttached())
      this.offsetProcess.start();
    return true;
  },
  zout_up() {
    this.offsetProcess.stop();
    return true;
  }
});
