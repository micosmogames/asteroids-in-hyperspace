import aframe from "aframe";
import { onLoadedDo } from '@micosmo/aframe/startup';
import { AsyncPromise } from '@micosmo/async/promise';

aframe.registerComponent("flip-normals", {
  schema: {},
  init() {
    onLoadedDo(() => {
      return AsyncPromise(resolve => resolve(flipNormals(this.el.components.geometry.geometry)));
    });
  },
});

function flipNormals(geometry) {
  // flip every vertex normal in geometry by multiplying normal by -1
  for (let i = 0; i < geometry.faces.length; i++) {
    const face = geometry.faces[i];
    face.normal.x = -1 * face.normal.x;
    face.normal.y = -1 * face.normal.y;
    face.normal.z = -1 * face.normal.z;
  }
  // change face winding order
  for (let i = 0; i < geometry.faces.length; i++) {
    const face = geometry.faces[i];
    const temp = face.a;
    face.a = face.c;
    face.c = temp;
  }
  // flip UV coordinates
  const faceVertexUvs = geometry.faceVertexUvs[0];
  for (let i = 0; i < faceVertexUvs.length; i++) {
    const temp = faceVertexUvs[i][0];
    faceVertexUvs[i][0] = faceVertexUvs[i][2];
    faceVertexUvs[i][2] = temp;
  }

  geometry.verticesNeedUpdate = true;
  geometry.uvsNeedUpdate = true;
  geometry.normalsNeedUpdate = true;

  geometry.computeFaceNormals();
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
}
