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
  return (geometry.type === 'BufferGeometry' ? flipBufferGeometryNormals : flipGeometryNormals)(geometry);
}

function flipBufferGeometryNormals(geometry) {
  // https://stackoverflow.com/questions/16824650/three-js-how-to-flip-normals-after-negative-scale

  const tempXYZ = [0, 0, 0];
  // flip normals
  for (let i = 0; i < geometry.attributes.normal.array.length / 9; i++) {
    // cache a coordinates
    tempXYZ[0] = geometry.attributes.normal.array[i * 9];
    tempXYZ[1] = geometry.attributes.normal.array[i * 9 + 1];
    tempXYZ[2] = geometry.attributes.normal.array[i * 9 + 2];

    // overwrite a with c
    geometry.attributes.normal.array[i * 9] = geometry.attributes.normal.array[i * 9 + 6];
    geometry.attributes.normal.array[i * 9 + 1] = geometry.attributes.normal.array[i * 9 + 7];
    geometry.attributes.normal.array[i * 9 + 2] = geometry.attributes.normal.array[i * 9 + 8];

    // overwrite c with stored a values
    geometry.attributes.normal.array[i * 9 + 6] = tempXYZ[0];
    geometry.attributes.normal.array[i * 9 + 7] = tempXYZ[1];
    geometry.attributes.normal.array[i * 9 + 8] = tempXYZ[2];
  }

  // change face winding order
  for (let i = 0; i < geometry.attributes.position.array.length / 9; i++) {
    // cache a coordinates
    tempXYZ[0] = geometry.attributes.position.array[i * 9];
    tempXYZ[1] = geometry.attributes.position.array[i * 9 + 1];
    tempXYZ[2] = geometry.attributes.position.array[i * 9 + 2];

    // overwrite a with c
    geometry.attributes.position.array[i * 9] = geometry.attributes.position.array[i * 9 + 6];
    geometry.attributes.position.array[i * 9 + 1] = geometry.attributes.position.array[i * 9 + 7];
    geometry.attributes.position.array[i * 9 + 2] = geometry.attributes.position.array[i * 9 + 8];

    // overwrite c with stored a values
    geometry.attributes.position.array[i * 9 + 6] = tempXYZ[0];
    geometry.attributes.position.array[i * 9 + 7] = tempXYZ[1];
    geometry.attributes.position.array[i * 9 + 8] = tempXYZ[2];
  }

  // flip UV coordinates
  for (let i = 0; i < geometry.attributes.uv.array.length / 6; i++) {
    // cache a coordinates
    tempXYZ[0] = geometry.attributes.uv.array[i * 6];
    tempXYZ[1] = geometry.attributes.uv.array[i * 6 + 1];

    // overwrite a with c
    geometry.attributes.uv.array[i * 6] = geometry.attributes.uv.array[i * 6 + 4];
    geometry.attributes.uv.array[i * 6 + 1] = geometry.attributes.uv.array[i * 6 + 5];

    // overwrite c with stored a values
    geometry.attributes.uv.array[i * 6 + 4] = tempXYZ[0];
    geometry.attributes.uv.array[i * 6 + 5] = tempXYZ[1];
  }

  geometry.attributes.normal.needsUpdate = true;
  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.uv.needsUpdate = true;
}

function flipGeometryNormals(geometry) {
  // https://stackoverflow.com/questions/16824650/three-js-how-to-flip-normals-after-negative-scale

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
