/* global THREE */

import aframe from 'aframe';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { removeIndex, removeValue } from '@micosmo/core/object';
import { timeToIntercept } from '../lib/targeting';
import * as ticker from "@micosmo/ticker/aframe-ticker";

const Pools = ['large', 'small'];
const RotationSpeed = THREE.Math.degToRad(90); // Degrees / s
const Mass = { large: 2, small: 1 };
const AvoidAttempts = 5;

aframe.registerComponent("ufos", {
  schema: { default: '' },
  init() {
    this.PlaySpace = this.el.sceneEl.querySelector('#PlaySpace');
    this.SpaceShip = this.el.sceneEl.querySelector('#SpaceShip');

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
      this.shotPool = this.el.sceneEl.querySelector('#Pools').components.mipool__shooter;
      this.playspaceRadius = this.el.sceneEl.querySelector('#PlaySpace').components.geometry.data.radius;
      this.ssRadius = this.SpaceShip.components.collider.getScaledRadius();
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
    this.ufos.forEach(ufo => {
      if (ufo.__game.shot.el) {
        this.shotPool.returnEntity(ufo.__game.shot.el);
        ufo.__game.shot.el = undefined;
      }
      this.ufoPools[ufo.__game.pool].returnEntity(ufo);
    });
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
    const sdt = dt / 1000; // Need delta in seconds
    this.ufos.forEach(ufo => {
      shotTraveller(this, ufo, sdt);

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
        const curDist = ufoPos.distanceTo(obsPos); const closingSpeed = ufoVel.distanceTo(obsVel);
        const collisionTime = curDist / closingSpeed;
        this.v1.copy(ufoPos).addScaledVector(ufoVel, collisionTime);
        this.v2.copy(obsPos).addScaledVector(obsVel, collisionTime);
        const collisionDist = this.v1.sub(this.v2).length(); // this.v1 (Collision Vector) used below
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
        const axis = ufoVel.x < ufoVel.y && ufoVel.x < ufoVel.z ? 'x' : ufoVel.y < ufoVel.z ? 'y' : 'z';
        const axisVelAdjust = (Math.abs(this.v1[axis] - ufoPos[axis]) + rObsUfo * 1.25 * (attempts + 1) * 0.50) / collisionTime;
        ufoVel[axis] = ufoVel[axis] > 0 ? ufoVel[axis] - axisVelAdjust : ufoVel[axis] + axisVelAdjust;
        ufoVel.setLength(ufo.__game.speed);
        //        console.log(ufo.__game.id, attempts, 'Avoid forward', axis);
        i = ufo.__game.obstacles.length; // Start again until no collisions
      }
      if (nObstacles === 0) {
        // Track towards the target point for this ufo
        const trackVec = this.v1.copy(ufo.__game.targetVector).sub(ufo.object3D.position);
        const time = trackVec.length() / ufo.__game.speed;
        ufoVel.addScaledVector(trackVec, sdt / time).setLength(ufo.__game.speed);
      }

      ufoPos.addScaledVector(ufoVel, sdt);
      ufo.object3D.rotateOnAxis(ufo.__game.rotationAxis, ufo.__game.angularSpeed * sdt);
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
        this.v3.copy(this.zAxis).applyQuaternion(ufo.object3D.quaternion).setLength(this.playspaceRadius + ufoPos.length());
        ufo.__game.targetVector.copy(ufo.object3D.position).add(this.v3);
        ufoVel.copy(this.v3).setLength(ufo.__game.speed);
        // Reload the shot count.
        ufo.__game.shot.count = ufo.__game.shot.clip;
        nextShotInterval(this, ufo);
      }
    });
    return 'more';
  },

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
  shooterHit(shot) {
    destroyShot(this, shot.__game.ufo, shot);
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
    obstacles: [],
    shot: {
      velocity: new THREE.Vector3(),
      speed: 0,
      count: 0,
      clip: 0,
      interval: 0,
      el: undefined
    }
  };
  const game = el.__game;
  game.id = ++IdUfo;
  game.speed = cfg.speed;
  game.radius = el.components.collider.getScaledRadius();
  self.v3.copy(self.zAxis).applyQuaternion(el.object3D.quaternion).setLength(self.playspaceRadius * 2);
  game.targetVector.copy(el.object3D.position).add(self.v3);
  game.velocity.copy(self.v3).setLength(game.speed);
  game.hits = cfg.hits;
  game.accuracy = cfg.accuracy;
  game.rotationAxis = self.yAxis;
  game.angularSpeed = RotationSpeed;
  //  game.directionalSpeed = DirectionalSpeed * game.speed;
  game.pool = pool;
  game.mass = Mass[pool];
  game.obstacles.length = 0;
  game.shot.count = game.shot.clip = cfg.shots;
  game.shot.speed = cfg.shotSpeed + game.speed; // Make sure that we have + velocity from rear shot
  return nextShotInterval(self, el);
}

function nextShotInterval(self, ufo) {
  const game = ufo.__game;
  game.shot.interval = 0;
  if (game.shot.count <= 0) return ufo;
  const tmGap = ufo.object3D.position.distanceTo(game.targetVector) / game.shot.count / game.speed;
  game.shot.interval = Math.random() * tmGap;
  return ufo;
}

function shotTraveller(self, ufo, sdt) {
  const game = ufo.__game;
  if (game.shot.el) {
    const vPos = game.shot.el.object3D.position;
    vPos.addScaledVector(game.shot.velocity, sdt);
    if (vPos.length() > self.playspaceRadius)
      destroyShot(self, ufo, game.shot.el);
    return;
  }
  if (game.shot.interval <= 0 || (game.shot.interval -= sdt) > 0) return;
  // Fire a shot at the spaceship, applying the accuracy factor.
  const ssPos = self.SpaceShip.object3D.position;
  const ssVel = self.SpaceShip.components.spaceship.velocity;
  const tIntercept = timeToIntercept(ufo.object3D.position, game.velocity, ssPos, ssVel, game.shot.speed);
  if (tIntercept === undefined || !ufo.object3D.visible || !self.SpaceShip.object3D.visible) {
    // Cannot intercept, so will need to try again.
    nextShotInterval(self, ufo);
    return;
  }
  const shot = self.shotPool.requestEntity();
  if (shot === undefined) {
    // Shot pool is empty so calculate a new shot interval
    nextShotInterval(self, ufo);
    return;
  }
  if (!shot.__game) shot.__game = { ufo: undefined };
  shot.__game.ufo = ufo;
  game.shot.el = shot;
  self.v2.copy(ssVel);
  if (self.v2.length() === 0)
    self.v2.copy(self.zAxis).applyQuaternion(self.SpaceShip.object3D.quaternion).setLength(0.0001);
  self.v2.multiplyScalar(tIntercept); // Target adjustment
  var speed = self.v1.copy(ssPos).add(self.v2).sub(ufo.object3D.position).add(game.velocity).length() / tIntercept; // True speed
  if (game.accuracy < 1) {
    // Adjust the intercept time to allow for accurracy.
    const spread = self.ssRadius / game.accuracy; // Behind or ahead.
    let accAdjust = (Math.random() * 2 - 1) * spread;
    if (Math.abs(accAdjust) > self.ssRadius)
      accAdjust *= 5; // Broaden the spread for a miss.
    self.v2.setLength(self.v2.length() + accAdjust); // Adjust intercept position
  }
  self.v1.copy(ssPos).add(self.v2); // Actual target position allowing for accuracy
  game.shot.velocity.copy(self.v1).sub(ufo.object3D.position); // Shot direction and distance
  // Align the direction of the shot to the target direction, will need to flip the shot around
  // as is facing in a -z direction.
  shot.object3D.position.copy(ufo.object3D.position);
  shot.object3D.lookAt(self.SpaceShip.object3D.getWorldPosition(self.v3).add(self.v2));
  self.axis.copy(self.yAxis).applyQuaternion(shot.object3D.quaternion);
  shot.object3D.applyQuaternion(self.quat.setFromAxisAngle(self.axis, Math.PI));
  // Position the shot on the radius of the ufo. Will make a slight adjustment to speed.
  shot.object3D.position.add(self.v2.copy(game.shot.velocity).setLength(game.radius));
  game.shot.velocity.setLength(Math.max(game.shot.speed - game.speed, Math.min(speed - game.radius / tIntercept, game.shot.speed))); // Now as a clamped velocity
  shot.object3D.visible = true;
  shot.play();
}

function destroyShot(self, ufo, shot) {
  self.shotPool.returnEntity(shot);
  ufo.__game.shot.el = undefined;
  ufo.__game.shot.count--;
  return nextShotInterval(self, ufo);
}

function randomiseVector(v, length) {
  v.setX(Math.random() * 2 - 1);
  v.setY(Math.random() * 2 - 1);
  v.setZ(Math.random() * 2 - 1);
  v.normalize().setLength(length);
  return v;
}
