import aframe from 'aframe';
import { createSchemaPersistentObject } from '@micosmo/aframe/lib/utils';
import { LazyPromise } from '@micosmo/async/promise';
import { requestArray, returnArray } from '@micosmo/core/object';

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
  },
  updateSchema(data) {
    createSchemaPersistentObject(this, data, '_state');
  },
  update(oldData) {
  },

  newGame() {
    this.state.level = this.data.level; // Start level for a new game.
    if (this.gamePromises) {
      this.gamePromises.forEach(lp => { if (!lp.isSettled) lp.reject() });
    }
    this.PlaySpace.components.playspace.newGame();
    this.SpaceShip.components.spaceship.newGame();
    this.Asteroids.components.asteroids.newGame();
    this.Ufos.components.ufos.newGame();
  },

  nextLevel() {
    if (!Levels[this.state.level]) {
      this.el.sceneEl.components.states.chain('Endgame');
      return;
    }
    this.PlaySpace.components.playspace.startLevel();
    this.SpaceShip.components.spaceship.startLevel();
    const asteroidsPromise = LazyPromise(); const ufosPromise = LazyPromise();
    this.Asteroids.components.asteroids.startLevel(Levels[this.state.level].asteroids, asteroidsPromise);
    this.Ufos.components.ufos.startLevel(Levels[this.state.level].ufos, ufosPromise);
    this.state.level++;
    this.gamePromises = requestArray(); this.gamePromises[0] = asteroidsPromise; this.gamePromises[1] = ufosPromise;
    Promise.all(this.gamePromises)
      .then(() => {
        this.el.sceneEl.components.states.chain('Nextlevel');
        returnArray(this.gamePromises); this.gamePromises = undefined;
      })
      .catch(() => { returnArray(this.gamePromises); this.gamePromises = undefined });
    this.el.sceneEl.components.states.chain('Playing');
  }
});

var Levels = {
  1: {
    asteroids: { count: 2, speed: 0.125, rotation: 0.25, hits: 1, large: {}, small: {}, tiny: {} },
    ufos: { count: 0, speed: 0.25, timing: 5, accuracy: 0.10, hits: 1, large: {}, small: {} }
  },
  2: {
    asteroids: { count: 3, speed: 0.125, rotation: 0.25, hits: 1, large: {}, small: {}, tiny: {} },
    ufos: { count: 0, speed: 0.25, timing: 5, accuracy: 0.10, hits: 1, large: {}, small: {} }
  },
}

const LevelSpeedFactor = 1.5;
const LevelRotationFactor = 1.25;
const LevelAccuracyFactor = 1.25;

function initialiseLevels() {
  for (let i = 1; ; i = i + 1) {
    if (!Levels[i]) return;
    const ast = Levels[i].asteroids; const ufo = Levels[i].ufos;
    if (ast.speed) {
      if (!ast.large.speed) ast.large.speed = ast.speed;
      if (!ast.small.speed) ast.small.speed = ast.speed * LevelSpeedFactor;
      if (!ast.tiny.speed) ast.tiny.speed = ast.speed * 2 * LevelSpeedFactor;
    }
    if (ast.rotation) {
      if (!ast.large.rotation) ast.large.rotation = ast.rotation;
      if (!ast.small.rotation) ast.small.rotation = ast.rotation * LevelRotationFactor;
      if (!ast.tiny.rotation) ast.tiny.rotation = ast.rotation * LevelRotationFactor * 2;
    }
    if (ast.hits) {
      if (!ast.large.hits) ast.large.hits = ast.hits;
      if (!ast.small.hits) ast.small.hits = ast.hits;
      if (!ast.tiny.hits) ast.tiny.hits = ast.hits;
    }
    if (ufo.count) {
      if (!ufo.large.count) ufo.large.count = ufo.count;
      if (!ufo.small.count) ufo.small.count = ufo.count;
    }
    if (ufo.speed) {
      if (!ufo.large.speed) ufo.large.speed = ufo.speed;
      if (!ufo.small.speed) ufo.small.speed = ufo.speed * LevelSpeedFactor;
    }
    if (ufo.timing) {
      if (!ufo.large.timing) ufo.large.timing = ufo.timing;
      if (!ufo.small.timing) ufo.small.timing = ufo.timing;
    }
    if (ufo.accuracy) {
      if (!ufo.large.accuracy) ufo.large.accuracy = ufo.accuracy;
      if (!ufo.small.accuracy) ufo.small.accuracy = ufo.accuracy * LevelAccuracyFactor;
    }
  }
}
