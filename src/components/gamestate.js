/* global THREE */
import aframe from 'aframe';
import { bindEvent } from 'aframe-event-decorators';
// import { startProcess, msWaiter } from '@micosmo/ticker/aframe-ticker';
import { onLoadedDo, afterLoadedDo } from '@micosmo/aframe/startup';
import { noVisibilityChecks as noKeyboardVisibilityChecks } from '@micosmo/aframe/keyboard';
// import { timeToIntercept } from '../lib/targeting';

const _ = undefined;
const PositionStates = [['Loading', 'Pause'], ['MainMenu', 'Endgame'], 'Nextlevel', 'Playing', 'Endlevel'];

aframe.registerComponent('gamestate', {
  schema: {
    state: { default: 'Loading' },
    states: { default: '' },
  },

  init() {
    const scene = this.el.sceneEl;
    if ((scene.components.gamestate ? 1 : 0) + scene.querySelectorAll('[gamestate]').length > 1)
      throw new Error('micosmo:component:gamestate:init: Single instance only');
    this.initialised = false;
    this.inVRMode = false;
    noKeyboardVisibilityChecks(); // Key listeners only inactive if related component is paused.
    this.recenterContext = { action: 'recenter' };
    this.SplashScreen = scene.querySelector('#SplashScreen');
    this.GameBoard = scene.querySelector('#GameBoard');
    this.Jukebox = scene.querySelector('[jukebox]');
    this.MainMenu = scene.querySelector('#MainMenu');
    this.EndGame = scene.querySelector('#EndGame');
    this.PauseGame = scene.querySelector('#PauseGame');
    this.Game = scene.querySelector('#Game');
    this.Env1 = scene.querySelector('#env-1');
    this.Player = scene.querySelector('#player');
    this.Cursor = scene.querySelector('#cursor');
    this.Hlc = scene.querySelector('[headless-controller]');
    this.Cursor = scene.querySelector('#cursor');
    this.WasdControls = scene.querySelector('[wasd-controls]');
    this.wasdActive = false;
    this.el.sceneEl.systems.keyboard.addListeners(this);
    this.el.sceneEl.systems.controller.addListeners(this);
    onLoadedDo(() => {
      this.compHeadless = this.Hlc.components['headless-controller'];
    });
    this.pauseCount = 0;

    /*
    const axis = new THREE.Vector3(0, 1, 1);
    const xAxis = new THREE.Vector3(1, 0, 0);
    const yAxis = new THREE.Vector3(0, 1, 0);
    const zAxis = new THREE.Vector3(0, 0, 1);
    const degrees = 45;
    const quat = new THREE.Quaternion().setFromAxisAngle(axis, THREE.Math.degToRad(degrees));
    const xQuat = new THREE.Quaternion().setFromAxisAngle(xAxis, THREE.Math.degToRad(degrees));
    const yQuat = new THREE.Quaternion().setFromAxisAngle(yAxis, THREE.Math.degToRad(degrees));
    const zQuat = new THREE.Quaternion().setFromAxisAngle(zAxis, THREE.Math.degToRad(degrees));

    const TVS = 0.25;
    const PVM = 0.75;
    const PV = new THREE.Vector3();
    const TV = new THREE.Vector3(0, 0, 1).setLength(TVS);
    const TP = new THREE.Vector3(2, 2, 2);
    const PP = new THREE.Vector3(1, 1, 1);
    const IP = new THREE.Vector3();

    const T1 = new THREE.Vector3();
    const T2 = new THREE.Vector3();
    const T3 = new THREE.Vector3();
    const T4 = new THREE.Vector3();

    const tm = timeToIntercept(PP, undefined, TP, TV, PVM);
    IP.copy(TP).addScaledVector(TV, tm);
    console.log(tm, IP);
    PV.copy(IP).sub(PP);
    console.log(PV.length() / tm, PVM, PV);
    */
  },

  update(oldData) {
    if (oldData.state !== this.data.state && this.initialised) {
      // Wait for play to start before emitting game state changes
      // Should only be ignoring 'Loading' anyway
      this.compStates.chain(this.data.state);
    }
    if (!this.compStates && !this.el.sceneEl.getAttribute('states'))
      this.el.sceneEl.setAttribute('states', { list: this.data.states, event: 'gamestatechanged' });
    this.compStates = this.el.sceneEl.components.states;
  },

  'enter-vr': bindEvent({ target: 'a-scene' }, function (evt) {
    this.inVRMode = true;
    afterLoadedDo(() => { this.compHeadless.toggleCursor(false) });
  }),
  'exit-vr': bindEvent({ target: 'a-scene' }, function (evt) {
    this.inVRMode = false;
    this.compHeadless.toggleCursor(true);
  }),

  startupComplete: bindEvent({ target: 'a-scene' }, function () {
    this.initialised = true;
    this.initPlayerPosition = this.Player.object3D.position.clone();
    this.compRecenter = this.Player.components.recenter;
    this.statePositions = Object.create(null);
    PositionStates.forEach(state => {
      const o = Object.create(null);
      o.playerPosition = this.initPlayerPosition.clone();
      o.playerOffset = new THREE.Vector3().copy(this.compRecenter.currentOffset);
      if (Array.isArray(state))
        state.forEach(s => { this.statePositions[s] = o }); // Multiple states to the one save point
      else
        this.statePositions[state] = o; // Individual state save point.
    });
    //    for (var el of this.GameBoard.children)
    //      if (el.id) el.pause(); // Pause all the gameboard children that are named.
    this.GameBoard.pause();
    this.SplashScreen.pause();
    this.PauseGame.pause();
    this.Player.pause();
    this.compStates.chain(this.data.state);
  }),

  // Recenter state is a simple flip/flop to pause the element in focus.
  startrecenter: bindEvent({ target: 'a-scene' }, function () {
    pauseGameState(this);
    this.compStates.call('Recenter', this.recenterContext);
  }),
  endrecenter: bindEvent({ target: 'a-scene' }, function () {
    playGameState(this);
    this.compStates.return(_, _, this.recenterContext);
  }),

  gamestatechanged: bindEvent({ target: 'a-scene' }, function (evt) {
    const detail = evt.detail;
    this.oldData.state = this.data.state = detail.to.state; // Keep gamestate data up to date.
    console.info(`micosmo:component:gamestate:gamestatechanged: '${detail.op}' to '${detail.to.state}' from '${detail.from.state}'`);
    var statePosition = this.statePositions[detail.from.state];
    if (statePosition && detail.from.action === 'exit') {
      statePosition.playerPosition.copy(this.Player.object3D.position);
      statePosition.playerOffset.copy(this.compRecenter.currentOffset);
    }
    statePosition = this.statePositions[detail.to.state];
    if (statePosition && detail.to.action === 'enter') {
      this.Player.object3D.position.copy(statePosition.playerPosition);
      this.compRecenter.currentOffset.copy(statePosition.playerOffset);
    }
    evt.detail.disperseEvent(evt, this); // Disperse event back to me
  }),

  enterLoading() {
    this.Jukebox.setAttribute('jukebox', 'state', 'pause');
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
    this.Game.components.game.newGame();
    this.compStates.chain('Nextlevel');
  },

  enterNextlevel() {
    this.Game.components.game.nextLevel();
  },

  enterPlaying() {
    this.Jukebox.setAttribute('jukebox', 'state', 'on');
    this.GameBoard.object3D.visible = true;
    this.Env1.object3D.visible = true;
    startElement(this.Game);
    this.compHeadless.startRaycaster('.cursor-game, [trigger-target]', 0, 1000);
    this.Hlc.setAttribute('headless-controller', 'triggerEventTarget', this.SpaceShip);
  },
  exitPlaying() {
    stopElement(this.Game);
    this.GameBoard.object3D.visible = false;
    this.Env1.object3D.visible = false;
    this.compHeadless.stopRaycaster();
    this.Hlc.setAttribute('headless-controller', 'triggerEventTarget', null);
  },
  recenterPlaying() { recenterElement(this, this.Game) },

  enterEndgame() {
    this.GameBoard.object3D.visible = true;
    startElement(this.EndGame);
    this.compHeadless.startRaycaster('.cursor-endgame');
  },
  exitEndgame() {
    stopElement(this.EndGame);
    this.GameBoard.object3D.visible = false;
    this.compHeadless.stopRaycaster();
  },
  recenterEndgame() { recenterElement(this, this.EndGame) },

  enterPause() {
    pauseGameState(this);
    startElement(this.PauseGame);
    this.jukeboxState = this.Jukebox.components.jukebox.data.state;
    this.Jukebox.setAttribute('jukebox', 'state', 'pause');
    this.compHeadless.startRaycaster('.cursor-pause');
  },
  exitPause() {
    playGameState(this);
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
  Pause_down(evt) { // Controller input
    this.compStates.call('Pause');
    return true;
  },
  keydown_Pause() {
    this.compStates.call('Pause');
    return true;
  },
  keydown_Cursor() {
    this.compHeadless.toggleCursor();
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
  keydown_wasd() {
    if (this.WasdControls) {
      this.wasdActive = !this.wasdActive;
      this.WasdControls.setAttribute('wasd-controls', 'enabled', this.wasdActive);
      return true;
    }
  },

  score: 0,
  highScore: 0,
  multiplier: 1,

  addscore: bindEvent(function (evt) {
    const amount = evt.detail * this.multiplier;
    this.score += amount;
    // this.scoreText.setAttribute('text__score', { value: this.score });
  }),

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
  if (gs.data.state === 'Recenter') el.pause();
  else el.play();
}

function pauseGameState(gs) {
  if (gs.pauseCount++ === 0)
    gs.el.pause(); // Pause the gamestate controls and keys
}

function playGameState(gs) {
  if (--gs.pauseCount === 0)
    gs.el.play();
}

/*
*  Ask Adam.
window.newgame = () => {
  document.querySelector('[game-state]').setAttribute('game-state', { state: 'NewGame' });
};
*/
