/* global THREE */

import aframe from 'aframe';
import { bindEvent } from "aframe-event-decorators";
import { hasOwnProperty } from "@micosmo/core/object";
import { methodNameBuilder } from '@micosmo/core/method';
import { createSchemaPersistentObject } from '@micosmo/aframe/lib/utils';
import { LazyPromise } from '@micosmo/async/promise';
import { onLoadedDo } from '@micosmo/aframe/startup';
import * as ticker from "@micosmo/ticker/aframe-ticker";

aframe.registerComponent("game", {
  schema: {
    level: { default: 1 }
  },
  init() {
    initialiseLevels();
    this.state = this.data._state;
    this.state.level = 0;
    this.state.levelTimer = 0;
    this.gamePlaying = false;
    const sceneEl = this.el.sceneEl;
    this.Player = sceneEl.querySelector('#player');
    this.LeftHand = sceneEl.querySelector('#leftHand');
    this.RightHand = sceneEl.querySelector('#rightHand');
    this.GamePointer = sceneEl.querySelector("#gamePointer");
    this.GameController = this.RightHand;
    this.PlaySpace = sceneEl.querySelector('#PlaySpace');
    this.Spaceship = sceneEl.querySelector('#Spaceship');
    this.Asteroids = sceneEl.querySelector('#Asteroids');
    this.Ufos = sceneEl.querySelector('#Ufos');
    this.gamePromises = [];
    this.fCollisionStart = methodNameBuilder('collisionstart_%1_%2', /%1/, /%2/);
    this.fCollisionEnd = methodNameBuilder('collisionend_%1_%2', /%1/, /%2/);

    this.gamePointerProcess = ticker.createProcess(this.touchTracker.bind(this), this.el);
    this.levelTimerProcess = ticker.createProcess(this.levelTimer.bind(this), this.el);
    this.v1 = new THREE.Vector3();

    onLoadedDo(() => {
      this.TouchPointer = this.GameController.components.controller.Touch;
      this.compAsteroids = this.Asteroids.components.asteroids;
      this.compUfos = this.Ufos.components.ufos;
      this.compSpaceShip = this.Spaceship.components.spaceship;
    });
  },
  updateSchema(data) {
    createSchemaPersistentObject(this, data, '_state');
  },
  update(oldData) {
  },
  remove() {
    this.levelTimerProcess.stop();
    this.reset();
  },

  newGame() {
    this.state.level = this.data.level; // Start level for a new game.
    this.reset();
    this.levelTimerProcess.restart();

    this.PlaySpace.components.playspace.newGame();
    this.Spaceship.components.spaceship.newGame();
    this.Asteroids.components.asteroids.newGame();
    this.Ufos.components.ufos.newGame();
  },
  reset() {
    if (this.gamePromises)
      this.gamePromises.forEach(lp => { if (!lp.isSettled) lp.reject() });
    this.gamePromises.length = 0;
  },
  endGame() {
    this.levelTimerProcess.stop();
    this.reset();
    this.PlaySpace.components.playspace.endGame();
    this.Spaceship.components.spaceship.endGame();
    this.Asteroids.components.asteroids.endGame();
    this.Ufos.components.ufos.endGame();
  },

  nextLevel() {
    if (!Levels[this.state.level]) {
      this.el.sceneEl.components.states.chain('Endgame');
      return;
    }
    this.state.levelTimer = 0;
    this.PlaySpace.components.playspace.startLevel();
    this.Spaceship.components.spaceship.startLevel();
    const asteroidsPromise = LazyPromise(); const ufosPromise = LazyPromise();
    this.gamePromises[0] = asteroidsPromise; this.gamePromises[1] = ufosPromise;
    this.Asteroids.components.asteroids.startLevel(Levels[this.state.level].asteroids, asteroidsPromise);
    this.Ufos.components.ufos.startLevel(Levels[this.state.level].ufos);
    this.state.level++;
    // Wait for asteroids to be cleared then wait fot any remaining ufos to be cleared.
    asteroidsPromise.promises
      .then(() => { this.Ufos.components.ufos.levelEnding(ufosPromise) })
      .catch(() => { });
    ufosPromise.promises
      .then(() => { this.el.sceneEl.components.states.chain('Nextlevel') })
      .catch(() => { });
    this.el.sceneEl.components.states.chain('Playing');
  },

  'enter-vr': bindEvent({ target: 'a-scene' }, function (evt) { if (this.gamePlaying) enablePointer(this) }),
  'exit-vr': bindEvent({ target: 'a-scene' }, function (evt) { if (this.gamePlaying) disablePointer(this) }),

  play() {
    this.gamePlaying = true;
    enablePointer(this);
  },
  pause() {
    disablePointer(this);
    this.gamePlaying = false;
  },

  touchTracker() {
    this.v1.copy(this.TouchPointer.object3D.position).applyQuaternion(this.GameController.object3D.quaternion);
    this.GamePointer.object3D.position.copy(this.GameController.object3D.position);
    this.GamePointer.object3D.quaternion.copy(this.GameController.object3D.quaternion);
    this.GamePointer.object3D.position.add(this.v1);
    return 'more';
  },
  levelTimer(tm, dt) {
    this.state.levelTimer += dt / 1000;
    return 'more';
  },

  levelTime() { return this.state.levelTimer },

  collisionstart: bindEvent(function (evt) {
    this[this.fCollisionStart(evt.detail.layer1, evt.detail.layer2)](evt.detail.el1, evt.detail.el2);
  }),
  collisionstart_gattler_asteroid(elRound, elAsteroid) {
    this.compSpaceShip.gattlerHit(elRound, elAsteroid);
    this.compAsteroids.gattlerHit(elAsteroid, elRound);
  },
  collisionstart_gattler_ufo(elRound, elUfo) {
    this.compSpaceShip.gattlerHit(elRound, elUfo);
    this.compUfos.gattlerHit(elUfo, elRound);
  },
  collisionstart_asteroid_asteroid(el1, el2) {
    this.compAsteroids.collision(el1, el2);
  },
  collisionstart_ufosensor_asteroid(el1, el2) {
    this.compUfos.startAvoidAsteroid(el1, el2);
  },
  collisionstart_ufosensor_ufosensor(el1, el2) {
    this.compUfos.startAvoidUfo(el1, el2);
  },
  collisionstart_spaceship_ufo(el1, el2) {
    this.compSpaceShip.collision(el1, el2);
  },
  collisionstart_spaceship_asteroid(el1, el2) {
    this.compSpaceShip.collision(el1, el2);
  },
  collisionstart_shooter_asteroid(elRound, elAsteroid) {
    this.compUfos.shooterHit(elRound, elAsteroid);
    this.compAsteroids.shooterHit(elAsteroid, elRound);
  },
  collisionstart_shooter_spaceship(elRound, elSpaceShip) {
    this.compUfos.shooterHit(elRound, elSpaceShip);
    this.compSpaceShip.shooterHit(elSpaceShip, elRound);
  },

  collisionend: bindEvent(function (evt) {
    const fEnd = this[this.fCollisionEnd(evt.detail.layer1, evt.detail.layer2)];
    if (fEnd) fEnd.call(this, evt.detail.el1, evt.detail.el2);
  }),
  collisionend_ufosensor_asteroid(el1, el2) {
    this.compUfos.endAvoidAsteroid(el1, el2);
  },
  collisionend_ufosensor_ufosensor(el1, el2) {
    this.compUfos.endAvoidUfo(el1, el2);
  }
});

function enablePointer(self) {
  if (self.GameController.components.controller.controllerPresent) {
    self.LeftHand.setAttribute('controller', 'visible', false);
    self.RightHand.setAttribute('controller', 'visible', false);
    self.GamePointer.object3D.visible = true;
    self.gamePointerProcess.restart();
  }
}

function disablePointer(self) {
  if (self.GamePointer.object3D.visible) {
    self.LeftHand.setAttribute('controller', 'visible', true);
    self.RightHand.setAttribute('controller', 'visible', true);
    self.GamePointer.object3D.visible = false;
    self.gamePointerProcess.stop();
  }
}

// Level 0 sets the defaults that trickle down, i.e. Level n-1 inherits from Level n
// Level properties:
//    asteroids:
//      speeds: The range of speeds for the asteriod
//        min: Minimum speed in m/s
//        max: Maximum speed in m/s
//      speedIntervals: Time intervals in seconds for speed adjustments, based on game level timer
//        min: Initial interval for asteroid to move at minimum speed. If asteroid is created
//             after the level timer has been started then this interval will be adjusted or will be zero.
//        toMax: Interval to accelerate from minimum to maximum speed, based on game level timer. If
//               the asteroid is created during this interval then the initial speed is adjusted to
//               the expected speed for the given level timer value, not exceeding the maximum speed.
//      rotation: Number of degrees / second rotation for the asteroid
//      accuracy: Tracking accuracy of asteroids hitting the Spaceship expressed as a %.
//      <Asteroid Size>: { large, small, tiny }
//        count: Number of asteroids to be spawned. 'large' are spawned at level start and 'small' and 'tiny'
//               are spawned when 'large' and 'small' asteroids are hit (Spaceship or UFO)
//        sFac: Speed factor applied to 'speeds' property. Ex. minSpeed = speeds.min * sFac.
//        rFac: Rotation factor applied to 'rotation' property.
//        aFac: Accuracy factor applied to 'accuracy' property.
//        hits: Number of hits required to split or destroy asteroid.
//    ufos:
//      speed: Speed of the ufo in m/s.
//      shotSpeed: The speed of a ufo shot on the Spaceship. Actual speed will range between 'shotSpeed' & 'shotSpeed + speed'
//                 as the shot speed is adjusted by the Spaceship velocity.
//      interval: Launch interval in seconds for each ufo. Actual interval is randomised between interval / 2 and interval.
//      accuracy: % accuracy of shots fired by Ufos
//      <Ufo Size>: { large, small }
//        count: Number of ufos to be spawned during this level
//        sFac: Speed factor applied to 'speed' property.
//        ssFac: Speed factor applied to 'shitSpeed' property.
//        iFac: Interval factor applied to 'interval' property.
//        aFac: Accuracy factor applied to 'accuracy' property.
//        hits: Number of hits required to destroy ufo.
//        shots: Shots fired on each traversal of the play area.

var Levels = {
  0: {
    asteroids: {
      speeds: { min: 0.05, max: 0.1 },
      speedIntervals: { min: 30, toMax: 30 },
      rotation: 45,
      accuracy: 0.10,
      large: { count: 1, sFac: 1, rFac: 1, aFac: 1, hits: 1 },
      small: { count: 2, sFac: 1.375, rFac: 1.5, aFac: 1.25, hits: 1 },
      tiny: { count: 2, sFac: 1.75, rFac: 2, aFac: 1.5, hits: 1 } },
    ufos: {
      speed: 0.10,
      shotSpeed: 0.10,
      interval: 1,
      accuracy: 0.10,
      large: { count: 0, sFac: 1, iFac: 1, aFac: 1, hits: 1, shots: 1, ssFac: 1 },
      small: { count: 0, sFac: 1.2, iFac: 1, aFac: 1, hits: 1, shots: 1, ssFac: 1 }
    }
  },
  1: { },
  2: { asteroids: { large: { count: 2 } } },
  3: { asteroids: { tiny: { count: 3 } }, ufos: { large: { count: 1 }, small: { count: 1 } } },
}

function initialiseLevels() {
  // Fill out the level data by inheriting missing values from the previous. Level 0 contains the start defaults
  // Data is copied at the class level ('asteroids' etc) and the class entry level ('large' etc).
  for (let i = 1; hasOwnProperty(Levels, i); i++) {
    const prevLevel = Levels[i - 1];
    const curLevel = Levels[i];
    for (var classType in prevLevel) { // 'asteroids', 'ufos' ...
      const prevCls = prevLevel[classType];
      const cls = curLevel[classType] || (curLevel[classType] = {});
      for (var classEntry in prevCls) { // 'large', 'small' ...
        const prevEntry = prevCls[classEntry]; // Data to inherit. Could be an object or scalar
        if (typeof prevEntry !== 'object') {
          if (!hasOwnProperty(cls, classEntry))
            cls[classEntry] = prevEntry;
          continue;
        }
        const clsEntry = cls[classEntry] || (cls[classEntry] = {});
        clsEntry.class = cls; // Link an entry back to the class for access to class data.
        for (var prop in prevEntry) {
          if (!hasOwnProperty(clsEntry, prop))
            clsEntry[prop] = prevEntry[prop];
        }
      }
    }
  }
//  console.log(Levels);
}
