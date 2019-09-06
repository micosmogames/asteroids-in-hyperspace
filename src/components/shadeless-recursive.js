/* global THREE */

import aframe from "aframe";
import { bindEvent } from "aframe-event-decorators";

aframe.registerComponent("shadeless-recursive", {
  modelloaded: bindEvent({ event: "model-loaded" }, function(evt) {
    const model = evt.detail.model;
    model.traverse(x => {
      if (x.material !== undefined) {
        x.material = new THREE.MeshBasicMaterial({
          color: x.material.color,
          map: x.material.map,
          fog: false,
          opacity: x.material.opacity,
          transparent: x.material.transparent
        });
      }
    });
  })
});
