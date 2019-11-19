/* global THREE */

import aframe from 'aframe';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { removeIndex, removeValue } from '@micosmo/core/object';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const Pools = ['large', 'small'];
const RefSpeed = 0.60; // m/s
const RotationSpeed = THREE.Math.degToRad(90); // Degrees / s
const DirectionalSpeed = THREE.Math.degToRad(180) / RefSpeed * 10; // Degrees / s
const Mass = { large: 2, small: 1 };
const AvoidAttempts = 5;

aframe.registerComponent("ufos", {
  schema: { default: '' },
  init() {
    this.PlaySpace = this.el.sceneEl.querySelector('#PlaySpace');

    this.thrust = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.thrusterCounters = { visible: 0, invisible: 0 };
    this.ufos = [];
    this.travelProcess = ticker.createProcess(this.traveller.bind(this), this.el);
    this.launchProcess = ticker.createProcess(this.launcher.bind(this), this.el);

    onLoadedDo(() => {
      const pools = this.el.sceneEl.querySelector('#Pools').components;
      this.ufoPools = {
        large: pools.mipool__ufo,
        small: pools.mipool__sufo,
      };
      this.playspaceRadius = this.el.sceneEl.querySelector('#PlaySpace').components.geometry.data.radius;
    });

    this.quat = new THREE.Quaternion();
    this.xAxis = new THREE.Vector3(1, 0, 0);
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.zAxis = new THREE.Vector3(0, 0, 1);
    this.axis = new THREE.Vector3();

    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();
    this.v3 = new THREE.Vector3();
    this.v4 = new THREE.Vector3();
  },
  update(oldData) {
  },
  remove() {
    this.reset();
  },
  reset() {
    this.travelProcess.stop();
    this.launchProcess.stop();
    this.ufos.forEach(el => { this.ufoPools[el.__game.pool].returnEntity(el) });
    this.ufos.length = 0;
    this.exhaustedPromise = undefined;
  },

  newGame() { this.reset() },
  startLevel(cfg) {
    this.launchCfg = cfg;
    this.launchProcess.start();
  },
  levelEnding(lp) {
    if (this.ufos.length === 0) {
      this.launchProcess.stop();
      lp.resolve();
    } else
      this.exhaustedPromise = lp;
  },

  * launcher(state) {
    const cfg = this.launchCfg;
    for (var pool of Pools) {
      const time = cfg[pool].timing / 2;
      for (let i = cfg[pool].count; i > 0; i--) {
        const waitTime = Math.random() * time + time; // Random time in seconds between timing & timing / 2.
        yield ticker.sWaiter(waitTime);
        startUfo(this, cfg[pool], pool);
      }
    };
  },

  traveller(tm, dt) {
    dt /= 1000; // Need delta in seconds
    this.ufos.forEach(ufo => {
      const ufoPos = ufo.object3D.position; const ufoVel = ufo.__game.velocity;
      let attempts = 0; let nObstacles = 0;
      let i = ufo.__game.obstacles.length;
      while (--i >= 0) {
        const obstacle = ufo.__game.obstacles[i];
        const obsPos = obstacle.object3D.position; const obsVel = obstacle.__game.velocity;
        const rObsUfo = ufo.__game.radius + obstacle.__game.radius;

        // Ignore any obstacle that is not going to collide with this ufo. We assume that they will collide and
        // calculate the time for the inner colliders to touch. Then determine the actual position in that time and
        // see if the collision would actually occur.
        // This needs to be calculated every frame as obstacles or the ufo can change direction.
        const curDist = this.v1.copy(ufoPos).sub(obsPos).length();
        const closingVel = this.v2.copy(ufoVel).sub(obsVel); const closingSpeed = closingVel.length();
        const collisionTime = curDist / closingSpeed;
        this.v3.copy(ufoPos).addScaledVector(ufoVel, collisionTime);
        this.v4.copy(obsPos).addScaledVector(obsVel, collisionTime);
        const collisionDist = this.v3.sub(this.v4).length();
        if (isNaN(collisionDist) || collisionDist > rObsUfo)
          continue; // No collision so ignore this obstacle.

        nObstacles++;
        const absX = Math.abs(ufoVel.x); const absY = Math.abs(ufoVel.y); const absZ = Math.abs(ufoVel.z)
        if (attempts++ >= AvoidAttempts) {
          // Have a problem moving forward, try backwards along major heading axis
          const axis = absX < absY && absY < absZ ? 'z' : absX < absY ? 'y' : 'x';
          ufoVel[axis] = -ufoVel[axis];
          //          console.log(ufo.__game.id, 'Avoid backwards', axis);
          break;
        }

        // Adjust direction along the axis with the least closing speed.
        // const axis = closingVel.x < closingVel.y && closingVel.x < closingVel.z ? 'x' : closingVel.y < closingVel.z ? 'y' : 'z';
        const axis = ufoVel.x < ufoVel.y && ufoVel.x < ufoVel.z ? 'x' : ufoVel.y < ufoVel.z ? 'y' : 'z';
        const axisVelAdjust = (Math.abs(this.v3[axis] - ufoPos[axis]) + rObsUfo * 1.25 * (attempts + 1) * 0.50) / collisionTime;
        ufoVel[axis] = ufoVel[axis] > 0 ? ufoVel[axis] - axisVelAdjust : ufoVel[axis] + axisVelAdjust;
        ufoVel.setLength(ufo.__game.speed);
        //        console.log(ufo.__game.id, attempts, 'Avoid forward', axis);
        i = ufo.__game.obstacles.length; // Start again until no collisions
      }
      if (nObstacles === 0) {
        // Track towards the target point for this ufo
        const trackVec = this.v1.copy(ufo.__game.targetVector).sub(ufo.object3D.position);
        const time = trackVec.length() / ufo.__game.speed;
        ufoVel.addScaledVector(trackVec, dt / time).setLength(ufo.__game.speed);
      }

      ufoPos.addScaledVector(ufoVel, dt);
      ufo.object3D.rotateOnAxis(ufo.__game.rotationAxis, ufo.__game.angularSpeed * dt);
      if (!ufo.object3D.visible) {
        if (ufoPos.length() < this.playspaceRadius - ufo.__game.radius / 4)
          ufo.object3D.visible = true; // Re-entering playspace
      } else if (ufoPos.length() >= this.playspaceRadius) {
        ufo.object3D.visible = false; // Leaving the playspace
        // Randomly loop back in from the other side but randomise the heading.
        ufoPos.setLength(this.playspaceRadius * (1 + 0.75 * Math.random())).negate();
        randomiseVector(this.v1, this.playspaceRadius * 0.25);
        this.PlaySpace.object3D.getWorldPosition(this.v2).add(this.v1);
        ufo.object3D.lookAt(this.v2); // Random direction but facing inwards
        this.v3.copy(this.zAxis).applyQuaternion(ufo.object3D.quaternion).setLength(this.playspaceRadius * 2);
        ufo.__game.targetVector.copy(ufo.object3D.position).add(this.v3);
        ufoVel.copy(this.v3).setLength(ufo.__game.speed);
      }
    });
    return 'more';
  },

  /*
  traveller(tm, dt) {
    dt /= 1000; // Need delta in seconds
    const Angle90 = Math.PI / 2;
    this.ufos.forEach(ufo => {
      const ufoPos = ufo.object3D.position; const ufoVel = ufo.__game.velocity;
      // Variation of Potential Function (or Vector Field Obstacle Avoidance) applied to velocity vector and obstacles in sensor range.
      this.v1.set(0, 0, 0);
      ufo.__game.obstacles.forEach(obstacle => {
        const obsPos = obstacle.object3D.position; const obsVel = obstacle.__game.velocity;
        const rObsUfo = ufo.__game.radius + obstacle.__game.radius;
        // Ignore any obstacle that is not going to collide with this ufo. We assume that they will collide and
        // calculate the time for the inner colliders to touch. Then determine the actual position in that time and
        // see if the collision would actually occur.
        // This needs to be calculated every frame as obstacles or the ufo can change direction.
        let curDist = this.v2.copy(ufoPos).sub(obsPos).length();
        const closingSpeed = this.v3.copy(ufoVel).sub(obsVel).length();
        const collisionTime = curDist / closingSpeed;
        this.v3.copy(ufoPos).addScaledVector(ufoVel, collisionTime);
        this.v4.copy(obsPos).addScaledVector(obsVel, collisionTime);
        const collisionDist = this.v3.sub(this.v4).length();
        if (isNaN(collisionDist) || collisionDist > rObsUfo)
          return; // No collision so ignore this obstacle.
        //        console.log(ufo.__game.id, 'Collision Detected', collisionDist, collisionTime, this.v3.sub(ufo.object3D.position).length(), THREE.Math.radToDeg(ufoVel.angleTo(this.v2)));
        curDist -= rObsUfo; // Current distance between inner colliders
        // We have a probable collision so now check the angle of this direction change. If greater than
        // 90 degrees then we attempt to avoid the object by either an upwards or downwards elevation
        // change.
        // Resolve for ufo velocity.y:
        // 1. ((pUfo + ufoVel * time) - (pObs + obsVel * time)).length() > rObs + rUfo.
        // 2. (pObs + obsVel * time) becomes tpObs --> ((pUfo + ufoVel * time) - tpObs).length() > rObs + rUfo
        // 3. ((pUfo - tpObs) + (ufoVel * time)).length() > rObs + rUfo
        // 4. pUfo - tpObs becomes uoDir --> (uoDir + (ufoVel * time)).length() > rObs + rUfo
        // 5. (uoDir.x + ufoVel.x * time)^2 + (uoDir.y + ufoVel.y * time)^2 + (uoDir.z + ufoVel.z * time)^2 > rObs + rUfo
        // 6. (uoDir.y + ufoVel.y * time)^2 > (rObs + rUfo)^2 - (uoDir.x + ufoVel.x * time)^2 - (uoDir.z + ufoVel.z * time)^2
        // 7. ufoVel.y > (sqrt((rObs + rUfo)^2 - (uoDir.x + ufoVel.x * time)^2 - (uoDir.z + ufoVel.z * time)^2) - uoDir.y) / time.
        /
        if (ufoVel.angleTo(this.v2) > Angle90) {
          const dirLen = this.v2.length();
          rObsUfo *= 1.5; // Allow a margin
          const tpObs = this.v4.negate(); const uoDir = tpObs.add(ufo.object3D.position);
          const ufoVel = this.v2.copy(ufoVel);
          const x = uoDir.x + ufoVel.x * collisionTime;
          const z = uoDir.z + ufoVel.z * collisionTime;
          //          console.log(uoDir, ufoVel, x, z, rObsUfo * rObsUfo - x * x - z * z - uoDir.y);
          const yDelta = (Math.sqrt(rObsUfo * rObsUfo - x * x - z * z) - uoDir.y) / collisionTime * ufo.__game.speed * dt / curDist;
          //          console.log(ufoVel, ufoVel.length())
          //          console.log('Elevation change', ufoVel.y, ufoVel.y);
          ufoVel.setY(obsVel.y < 0 ? ufoVel.y + yDelta : ufoVel.y - yDelta);
          ufoVel.setLength(dirLen);
        }
        /
        // Can now accumulate the directional change
        if (ufoVel.angleTo(this.v2) > Angle90) {
          this.v2.negate();
          if (ufoPos.y > obsPos.y) {
            if (ufoVel.y > obsVel.y) {
              if (ufoVel.y > this.v2.y) this.v2.setY(ufoVel.y);
            } else if (obsVel.y > this.v2.y) this.v2.setY(obsVel.y);
          } else {
            if (ufoVel.y < obsVel.y) {
              if (ufoVel.y < this.v2.y) this.v2.setY(ufoVel.y);
            } else this.v2.setY(-ufoVel.y);
          }
          this.v1.add(this.v2.normalize()); // v2 contains adjusted direction vector
        } else
          this.v1.add(this.v2.normalize().multiplyScalar(1 / (curDist * curDist))); // v2 contains adjusted direction vector
      });
      // const len = this.v2.copy(ufo.__game.targetVector).sub(ufo.object3D.position).length();
      // this.v2.normalize().multiplyScalar(1 / (len * len));
      // this.v3.copy(this.v2).add(this.v1);
      //        const angle = ufoVel.angleTo(this.v3);
      //        const time = angle / ufo.__game.directionalSpeed;
      //        console.log(msTime, THREE.Math.radToDeg(angle), ufo.__game.directionalSpeed * 360 / (Math.PI * 2));
      //        ufoVel.copy(this.v2).addScaledVector(this.v1, dt / time).setLength(ufo.__game.speed);
      // ufoVel.copy(this.v2).add(this.v1).setLength(ufo.__game.speed);
      ufoVel.add(this.v1).setLength(ufo.__game.speed);

      ufoPos.addScaledVector(ufoVel, dt);
      ufo.object3D.rotateOnAxis(ufo.__game.rotationAxis, ufo.__game.angularSpeed * dt);
      if (!ufo.object3D.visible) {
        if (ufoPos.length() < this.playspaceRadius - ufo.__game.radius / 4)
          ufo.object3D.visible = true; // Re-entering playspace
      } else if (ufoPos.length() >= this.playspaceRadius) {
        ufo.object3D.visible = false; // Leaving the playspace
        // Randomly loop back in from the other side but randomise the heading.
        ufoPos.setLength(this.playspaceRadius * (1 + 0.75 * Math.random())).negate();
        randomiseVector(this.v1, this.playspaceRadius * 0.50);
        this.PlaySpace.object3D.getWorldPosition(this.v2).add(this.v1);
        ufo.object3D.lookAt(this.v2); // Random direction but facing inwards
        this.v3.copy(this.zAxis).applyQuaternion(ufo.object3D.quaternion).setLength(this.playspaceRadius * 2);
        ufo.__game.targetVector.copy(ufo.object3D.position).add(this.v3);
        ufoVel.copy(this.v3).setLength(ufo.__game.speed);
      }
    })
    return 'more';
  },
*/
  gattlerHit(el) {
    const idx = this.ufos.indexOf(el);
    if (idx < 0 || --el.__game.hits > 0)
      return;
    removeIndex(this.ufos, idx);
    this.ufoPools[el.__game.pool].returnEntity(el);
    if (this.ufos.length === 0 && this.exhaustedPromise) {
      this.exhaustedPromise.resolve();
      this.travelProcess.stop();
      this.launchProcess.stop();
      this.exhaustedPromise = undefined;
    }
  },
  startAvoidUfo(el1, el2) {
    // Duplicate events are thrown away
    el1.__game.obstacles.push(el2);
    el2.__game.obstacles.push(el1);
  },
  endAvoidUfo(el1, el2) {
    // Duplicate events are thrown away
    removeValue(el1.__game.obstacles, el2);
    removeValue(el2.__game.obstacles, el1);
  },
  startAvoidAsteroid(el1, el2) {
    el1.__game.obstacles.push(el2);
  },
  endAvoidAsteroid(el1, el2) {
    removeValue(el1.__game.obstacles, el2);
  }
});

function startUfo(self, cfg, pool) {
  const el = self.ufoPools[pool].requestEntity();
  if (el === undefined) return; // Ufo pool is empty.
  self.travelProcess.restart();
  randomiseVector(el.object3D.position, self.playspaceRadius - 0.01); // Random start position
  randomiseVector(self.v1, self.playspaceRadius / 2);
  self.PlaySpace.object3D.getWorldPosition(self.v2).add(self.v1);
  el.object3D.lookAt(self.v2); // Random direction but facing inwards
  self.ufos.push(initUfo(self, el, cfg, pool));
  el.object3D.visible = true;
  el.play();
}

let IdUfo = 0;
function initUfo(self, el, cfg, pool) {
  if (!el.__game) el.__game = {
    velocity: new THREE.Vector3(),
    rotationAxis: new THREE.Vector3(),
    targetVector: new THREE.Vector3(),
    obstacles: []
  };
  el.__game.id = ++IdUfo;
  el.__game.speed = cfg.speed * RefSpeed;
  el.__game.radius = el.components.collider.data.radius;
  self.v3.copy(self.zAxis).applyQuaternion(el.object3D.quaternion).setLength(self.playspaceRadius * 2);
  el.__game.targetVector.copy(el.object3D.position).add(self.v3);
  el.__game.velocity.copy(self.v3).setLength(el.__game.speed);
  el.__game.hits = cfg.hits;
  el.__game.accuracy = cfg.accuracy;
  el.__game.rotationAxis = self.yAxis;
  el.__game.angularSpeed = RotationSpeed;
  el.__game.directionalSpeed = DirectionalSpeed * el.__game.speed;
  el.__game.pool = pool;
  el.__game.mass = Mass[pool];
  el.__game.obstacles.length = 0;
  return el;
}

function randomiseVector(v, length) {
  v.setX(Math.random() * 2 - 1);
  v.setY(Math.random() * 2 - 1);
  v.setZ(Math.random() * 2 - 1);
  v.normalize().setLength(length);
  return v;
}
