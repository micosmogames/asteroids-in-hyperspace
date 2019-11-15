import aframe from 'aframe';
import { bindEvent } from "aframe-event-decorators";
import { createSchemaPersistentObject } from '@micosmo/aframe/lib/utils';
import { LazyPromise } from '@micosmo/async/promise';
import { onLoadedDo } from '@micosmo/aframe/startup';

aframe.registerComponent("game", {
  schema: {
    level: { default: 1 }
  },
  init() {
    initialiseLevels();
    this.state = this.data._state;
    this.state.level = 0;
    const sceneEl = this.el.sceneEl;
    this.PlaySpace = sceneEl.querySelector('#PlaySpace');
    this.SpaceShip = sceneEl.querySelector('#SpaceShip');
    this.Asteroids = sceneEl.querySelector('#Asteroids');
    this.Ufos = sceneEl.querySelector('#Ufos');
    this.gamePromises = [];

    onLoadedDo(() => {
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

  collisionstart: bindEvent(function (evt) {
    this[`collisionstart_${evt.detail.layer1}_${evt.detail.layer2}`](evt.detail.el1, evt.detail.el2);
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

  collisionend: bindEvent(function (evt) {
    this[`collisionend_${evt.detail.layer1}_${evt.detail.layer2}`](evt.detail.el1, evt.detail.el2);
  }),
  collisionend_gattler_asteroid(elRound, elAsteroid) {
  },
  collisionend_gattler_ufo(elRound, elUfo) {
  },
  collisionend_asteroid_asteroid(el1, el2) {
  },
  collisionend_ufosensor_asteroid(el1, el2) {
    this.compUfos.endAvoidAsteroid(el1, el2);
  },
  collisionend_ufosensor_ufosensor(el1, el2) {
    this.compUfos.endAvoidUfo(el1, el2);
  },
  collisionend_spaceship_ufo(el1, el2) {
  },
  collisionend_spaceship_asteroid(el1, el2) {
  },
});

var Levels = {
  1: {
    asteroids: { count: 3, speed: 0.125, rotation: 0.25, hits: 1, large: { count: 15 }, small: {}, tiny: {} },
    ufos: { count: 2, speed: 0.25, timing: 20, accuracy: 0.10, hits: 1, large: { count: 2, timing: 1 }, small: { count: 0, timing: 1 } }
  },
  2: {
    asteroids: { count: 3, speed: 0.125, rotation: 0.25, hits: 1, large: {}, small: {}, tiny: {} },
    ufos: { count: 0, speed: 0.25, timing: 60, accuracy: 0.10, hits: 1, large: {}, small: { count: 2 } }
  },
}

const LevelSpeedFactor = 1.5;
const LevelRotationFactor = 1.5;
const LevelAccuracyFactor = 1.5;

function initialiseLevels() {
  for (let i = 1; ; i = i + 1) {
    if (!Levels[i]) return;
    const ast = Levels[i].asteroids; const ufo = Levels[i].ufos;
    if (ast.count) {
      if (ast.large.count === undefined) ast.large.count = ast.count;
      if (ast.small.count === undefined) ast.small.count = ast.count;
      if (ast.tiny.count === undefined) ast.tiny.count = ast.count;
    }
    if (ast.speed) {
      if (ast.large.speed === undefined) ast.large.speed = ast.speed;
      if (ast.small.speed === undefined) ast.small.speed = ast.speed * LevelSpeedFactor;
      if (ast.tiny.speed === undefined) ast.tiny.speed = ast.speed * 2 * LevelSpeedFactor;
    }
    if (ast.rotation) {
      if (ast.large.rotation === undefined) ast.large.rotation = ast.rotation;
      if (ast.small.rotation === undefined) ast.small.rotation = ast.rotation * LevelRotationFactor;
      if (ast.tiny.rotation === undefined) ast.tiny.rotation = ast.rotation * LevelRotationFactor * 2;
    }
    if (ast.hits) {
      if (ast.large.hits === undefined) ast.large.hits = ast.hits;
      if (ast.small.hits === undefined) ast.small.hits = ast.hits;
      if (ast.tiny.hits === undefined) ast.tiny.hits = ast.hits;
    }
    if (ufo.count) {
      if (ufo.large.count === undefined) ufo.large.count = ufo.count;
      if (ufo.small.count === undefined) ufo.small.count = ufo.count;
    }
    if (ufo.speed) {
      if (ufo.large.speed === undefined) ufo.large.speed = ufo.speed;
      if (ufo.small.speed === undefined) ufo.small.speed = ufo.speed * LevelSpeedFactor;
    }
    if (ufo.timing) {
      if (ufo.large.timing === undefined) ufo.large.timing = ufo.timing;
      if (ufo.small.timing === undefined) ufo.small.timing = ufo.timing;
    }
    if (ufo.accuracy) {
      if (ufo.large.accuracy === undefined) ufo.large.accuracy = ufo.accuracy;
      if (ufo.small.accuracy === undefined) ufo.small.accuracy = ufo.accuracy * LevelAccuracyFactor;
    }
  }
}
