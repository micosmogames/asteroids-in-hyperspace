// /* global THREE */
import aframe from 'aframe';
import { bindEvent } from 'aframe-event-decorators';
// import { startProcess, msWaiter } from '@micosmo/ticker/aframe-ticker';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { noVisibilityChecks as noKeyboardVisibilityChecks } from '@micosmo/aframe/keyboard';

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
    noKeyboardVisibilityChecks(); // Key listeners only inactive if related component is paused.
    instance = this;
    const scene = this.el.sceneEl;
    this.SplashScreen = scene.querySelector('#SplashScreen');
    this.GameBoard = scene.querySelector('#GameBoard');
    this.Jukebox = scene.querySelector('[jukebox]');
    this.MainMenu = scene.querySelector('#MainMenu');
    this.PauseGame = scene.querySelector('#PauseGame');
    this.Game = scene.querySelector('#Game');
    this.Env1 = scene.querySelector('#env-1');
    this.Player = scene.querySelector('#player');
    this.el.sceneEl.systems.keyboard.addListeners(this);
    onLoadedDo(() => {
      this.compHeadless = scene.querySelector('[headless-controller]').components['headless-controller'];
    });
  },

  update(oldData) {
    if (oldData.state !== this.data.state && initialised) {
      // Wait for play to start before emitting game state changes
      // Should only be ignoring 'Loading' anyway
      this.states.chain(this.data.state);
    }
    if (!this.compStates && !(this.compStates = this.el.getAttribute('states')))
      this.el.setAttribute('states', { list: this.data.states, event: 'gamestatechanged' });
    this.compStates = this.el.components.states;
  },

  startupComplete: bindEvent(function () {
    initialised = true;
    for (var el of this.GameBoard.children)
      if (el.id) el.pause(); // Pause all the gameboard children that are named.
    this.GameBoard.pause();
    this.SplashScreen.pause();
    this.PauseGame.pause();
    this.Player.pause();
    this.states = this.el.sceneEl.components.states;
    this.states.chain(this.data.state);
  }),

  gamestatechanged: bindEvent(function (evt) {
    const detail = evt.detail;
    this.oldData.state = this.data.state = detail.to.state; // Keep gamestate data up to date.
    console.info(`micosmo:component:gamestate:gamestatechanged: '${detail.from.state}' to '${detail.to.state}' by '${detail.op}'`);
    evt.detail.disperseEvent(evt, this); // Disperse event back to me
  }),

  enterLoading() {
    startElement(this.SplashScreen); startElement(this.Player);
    this.compHeadless.startRaycaster('.cursor-splash');
  },
  exitLoading() {
    stopElement(this.SplashScreen);
    this.compHeadless.stopRaycaster();
  },
  recenterLoading() { recenterElement(this, this.SplashScreen) },

  enterMainMenu() {
    this.Jukebox.setAttribute('jukebox', 'state', 'pause');
    this.GameBoard.object3D.visible = true;
    startElement(this.MainMenu);
    this.compHeadless.startRaycaster('.cursor-menu');
  },
  exitMainMenu() {
    stopElement(this.MainMenu);
    this.compHeadless.stopRaycaster();
  },
  recenterMainMenu() { recenterElement(this, this.MainMenu) },

  enterNewgame() {
    this.Jukebox.setAttribute('jukebox', 'state', 'on');
    this.GameBoard.object3D.visible = true;
    this.Env1.object3D.visible = true;
    startElement(this.Game);
    this.compHeadless.startRaycaster('.cursor-game');
  },
  exitNewgame() {
    stopElement(this.Game);
    this.GameBoard.object3D.visible = false;
    this.Env1.object3D.visible = false;
    this.compHeadless.stopRaycaster();
  },
  recenterNewgame() { recenterElement(this, this.Gameboard) },

  enterPause() {
    startElement(this.PauseGame);
    this.jukeboxState = this.Jukebox.components.jukebox.data.state;
    this.Jukebox.setAttribute('jukebox', 'state', 'pause');
    this.compHeadless.startRaycaster('.cursor-pause');
  },
  exitPause() {
    stopElement(this.PauseGame);
    if (this.jukeboxState === 'on')
      this.Jukebox.setAttribute('jukebox', 'state', 'on');
    this.compHeadless.stopRaycaster();
  },
  recenterPause() { recenterElement(this, this.PauseGame) },

  /*
      case 'Playing':
        triggerCacheTimeout = 1000;
        cursorEl.setAttribute('raycaster', {
          objects: '[headless], #timeWarpButton',
          interval: 0
        });
        break;
  */

  keydown_Test(id, kc, evt) {
    console.log('TestKeys', id, kc, evt);
    return false;
  },
  keyup_Test(id, kc, evt) {
    console.log('TestKeys', id, kc, evt);
    return false;
  },
  keydown_Pause() {
    this.compStates.call('Pause');
    return true;
  },
  keydown_Cursor() {
    this.el.sceneEl.querySelector('#cursor').components['headless-controller'].toggleCursor();
    return true;
  },
  keydown_VRToggle() {
    const el = this.el.sceneEl;
    el.is('vr-mode') ? el.exitVR() : el.enterVR();
    return true;
  },
  keydown_Menu() {
    if (this.data.state !== 'Pause')
      this.compStates.chain('MainMenu');
    return true;
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

function startElement(el) {
  el.object3D.visible = true;
  el.play();
}

function stopElement(el) {
  el.object3D.visible = false;
  el.pause();
}

function recenterElement(gs, el) {
  if (gs.recentering) el.pause();
  else el.play();
}

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
