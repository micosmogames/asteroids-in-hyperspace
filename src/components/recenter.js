/* global THREE */
import aframe from "aframe";

aframe.registerComponent("recenter", {
  schema: {
    offset: { type: "vec3" }
  },
  init() {
    window.recenter = this.around.bind(this);
  },
  around(x) {
    const centerEl = x || document.querySelector("[camera]");
    // const boardEl = document.querySelector("#game-board");

    const rotationY = new THREE.Euler().setFromRotationMatrix(
      centerEl.object3D.matrix,
      "YXZ"
    ).y;

    const phi = -rotationY;
    const rotation = this.el.object3D.rotation;
    rotation.set(0, phi, 0);
    // console.log(phi);

    const transformedOffset = new THREE.Vector3().copy(this.data.offset);

    this.el.object3D.position
      .copy(centerEl.object3D.position)
      .applyEuler(rotation)
      .negate()
      .add(transformedOffset);
  }
});
