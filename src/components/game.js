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
    this.gamePlaying = false;
    const sceneEl = this.el.sceneEl;
    this.Player = sceneEl.querySelector('#player');
    this.LeftHand = sceneEl.querySelector('#leftHand');
    this.RightHand = sceneEl.querySelector('#rightHand');
    this.GamePointer = sceneEl.querySelector("#gamePointer");
    this.GameController = this.RightHand;
    this.PlaySpace = sceneEl.querySelector('#PlaySpace');
    this.SpaceShip = sceneEl.querySelector('#SpaceShip');
    this.Asteroids = sceneEl.querySelector('#Asteroids');
    this.Ufos = sceneEl.querySelector('#Ufos');
    this.gamePromises = [];
    this.fCollisionStart = methodNameBuilder('collisionstart_%1_%2', /%1/, /%2/);
    this.fCollisionEnd = methodNameBuilder('collisionend_%1_%2', /%1/, /%2/);

    this.gamePointerProcess = ticker.createProcess(this.touchTracker.bind(this), this.el);
    this.v1 = new THREE.Vector3();

    onLoadedDo(() => {
      this.TouchPointer = this.GameController.components.controller.Touch;
      this.compAsteroids = this.Asteroids.components.asteroids;
      this.compUfos = this.Ufos.components.ufos;
      this.compSpaceShip = this.SpaceShip.components.spaceship;
    });
  },
  updateSchema(data) {
    createSchemaPersistentObject(this, data, '_state');
  },
  update(oldData) {
  },
  remove() {
    this.reset();
  },

  newGame() {
    this.state.level = this.data.level; // Start level for a new game.
    this.reset();

    this.PlaySpace.components.playspace.newGame();
    this.SpaceShip.components.spaceship.newGame();
    this.Asteroids.components.asteroids.newGame();
    this.Ufos.components.ufos.newGame();
  },
  reset() {
    if (this.gamePromises)
      this.gamePromises.forEach(lp => { if (!lp.isSettled) lp.reject() });
    this.gamePromises.length = 0;
  },

  nextLevel() {
    if (!Levels[this.state.level]) {
      this.el.sceneEl.components.states.chain('Endgame');
      return;
    }
    this.PlaySpace.components.playspace.startLevel();
    this.SpaceShip.components.spaceship.startLevel();
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
var Levels = {
  0: {
    asteroids: {
      large: { count: 1, speed: 0.025, rotation: 45, hits: 1 },
      small: { count: 2, speed: 0.0375, rotation: 67.5, hits: 1 },
      tiny: { count: 2, speed: 0.050, rotation: 90, hits: 1 } },
    ufos: {
      large: { count: 0, speed: 0.10, timing: 5, accuracy: 0.10, hits: 1, shots: 1, shotSpeed: 0.10 },
      small: { count: 0, speed: 0.12, timing: 5, accuracy: 0.10, hits: 1, shots: 1, shotSpeed: 0.10 }
    }
  },
  1: { asteroids: { large: {}, small: {}, tiny: {} }, ufos: { large: { }, small: { } } },
  2: { asteroids: { large: { count: 2 }, small: {}, tiny: {} }, ufos: { large: {}, small: {} } },
  3: { asteroids: { large: {}, small: {}, tiny: { count: 3 } }, ufos: { large: { count: 1 }, small: { count: 1 } } },
}

function initialiseLevels() {
  // Fill out the level data by inheriting missing values from the previous. Level 0 contains all defaults
  for (let i = 1; hasOwnProperty(Levels, i); i++) {
    const level = Levels[i];
    for (var classType in level) {
      const cls = level[classType];
      for (var classSize in cls) {
        const clsSize = cls[classSize];
        const prevSize = Levels[i - 1][classType][classSize]; // Data to inherit from
        for (var prop in prevSize) {
          if (!hasOwnProperty(clsSize, prop))
            clsSize[prop] = prevSize[prop];
        }
      }
    }
  }
}
