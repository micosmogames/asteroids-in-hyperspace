// /* global THREE */
import aframe from 'aframe';
import { bindEvent } from 'aframe-event-decorators';
// import { startProcess, msWaiter } from '@micosmo/ticker/aframe-ticker';
// import { afterLoadedDo } from '@micosmo/aframe/startup';

const controlsNames = ['Basic', 'Advanced'];

let instance = undefined;
let initialised = false;

let score = 0;
const highScore = 0;
const multiplier = 1;

aframe.registerComponent('gamestate', {
  schema: {
    state: { default: 'Loading' },
    states: { default: '' },
    controls: { default: 'Basic', oneOf: controlsNames },
  },

  init() {
    if (instance !== undefined && instance !== this)
      throw new Error('micosmo:component:gamestate:init: Single instance only');
    instance = this;
    const scene = this.el.sceneEl;
    this.SplashScreen = scene.querySelector('#SplashScreen');
    this.GameBoard = scene.querySelector('#GameBoard');
    this.Jukebox = scene.querySelector('#Jukebox');
    this.el.sceneEl.systems.keyboard.addListeners(this);
  },

  update(oldData) {
    if (oldData.state !== this.data.state && initialised) {
      // Wait for play start before emitting game state changes
      // Should only be ignoring 'Loading' anyway
      this.states.chain(this.data.state);
    }
    if (!this.compStates && !(this.compStates = this.el.getAttribute('states'))) {
      this.el.setAttribute('states', 'list', this.data.states);
    }
  },

  startupComplete: bindEvent(function () {
    initialised = true;
    this.states = this.el.sceneEl.components.states;
    console.log(this.states);
    this.states.chain(this.data.state);
  }),

  keydown_Pause() {
    this.gamePausedEl.emit('startPause', {
      displayPause: true,
      endCallback: () => { }
    });
    return true;
  },
  keydown_Cursor() {
    document.getElementById('cursor').components['headless-controller'].toggleCursor();
    return true;
  },
  keydown_VRToggle() {
    const el = this.el.sceneEl;
    el.is('vr-mode') ? el.exitVR() : el.enterVR();
  },

  gamestatechanged: bindEvent(function (evt) {
    const detail = evt.detail;
    this.oldData.state = this.data.state = detail.toState; // Keep gamestate upto date.
    console.info(`micosmo:component:gamestate:gamestatechanged: ${detail.fromState ? `'${detail.fromState}' to ` : ''}${detail.toState} by '${detail.how}'`);
    if (detail.fromState) {
      const meth = `exit${detail.fromState}`;
      if (this[meth])
        this[meth](detail);
    }
    const meth = `enter${detail.toState}`;
    if (this[meth])
      this[meth](detail);
  }),

  enterLoading() {
    this.SplashScreen.object3D.visible = true;
  },
  exitLoading() {
    this.SplashScreen.object3D.visible = false;
    this.el.sceneEl.querySelector('#')
  },
  enterMainMenu() {
    this.el.sceneEl.querySelector('#GameBoard').object3D.visible = true;
  },
  exitMainMenu() {
    this.el.sceneEl.querySelector('#GameBoard').object3D.visible = false;
  },

  addscore: bindEvent(function (evt) {
    const amount = evt.detail * multiplier;
    score += amount;
    this.scoreText.setAttribute('text__score', {
      value: score,
    });
  }),

  isAdvancedControls() {
    return this.data.controls === 'Advanced';
  },
  isBasicControls() {
    return this.data.controls === 'Basic';
  },

  setEnvironment: (() => {
    let currentEnvironment;
    return function (id) {
      if (id === currentEnvironment) {
        return;
      }
      Array.from(
        document.querySelector('#environments').children
      ).forEach(e => e.setAttribute('visible', e.id === id));
      currentEnvironment = id;
    };
  })(),
});

window.newgame = () => {
  document.querySelector('[game-state]').setAttribute('game-state', {
    state: 'NewGame',
  });
};

export default {
  get instance() {
    return instance;
  },
  get score() {
    return score;
  },
  get highScore() {
    return highScore;
  },
  get multiplier() {
    return multiplier;
  },
};
