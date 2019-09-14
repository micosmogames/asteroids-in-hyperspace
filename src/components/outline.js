/* global THREE */

import aframe from "aframe";
import { bindEvent } from "aframe-event-decorators";

const outlineVS = `
  uniform float thickness;

  void main() {
    vec3 scaledPos = position + (normal * thickness);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(scaledPos, 1.0);
  }
`;

const outlineFS = `
  uniform vec3 color;

  void main() {
    gl_FragColor = vec4(color, 1.0);
    gl_FragColor = linearToOutputTexel( gl_FragColor );
  }
`;

aframe.registerComponent("outline", {
  schema: {
    thickness: { type: "number", default: 0.01 },
    color: { type: "color", default: "white" }
  },
  init: function() {
    this.color = new THREE.Color();
    this._updateUniforms();
    this.outlineMaterial = new THREE.ShaderMaterial({
      uniforms: this._uniforms,
      vertexShader: outlineVS,
      fragmentShader: outlineFS
    });
    this.outlineMaterial.depthWrite = true;
    if ("mesh" in this.el.object3DMap) {
      this._applyShader();
    }
  },
  update: function(oldData) {
    this._updateUniforms();
  },
  object3dset: bindEvent(function(evt) {
    if (evt.detail.type === "mesh") {
      this._applyShader();
    }
  }),
  _updateUniforms: function() {
    if (this._uniforms === undefined) {
      this._uniforms = {};
    }
    this._uniforms.color = { value: this.color.set(this.data.color) };
    this._uniforms.thickness = { value: this.data.thickness };
  },
  _applyShader() {
    const mesh = this.el.getObject3D("mesh");
    this.clonedMesh = mesh.clone();
    this.clonedMesh.material = this.outlineMaterial;
    mesh.add(this.clonedMesh);
  }
});
