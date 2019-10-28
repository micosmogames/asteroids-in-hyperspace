/* global THREE */
import aframe from 'aframe';
import { bindEvent } from 'aframe-event-decorators';
// import { startProcess, msWaiter } from '@micosmo/ticker/aframe-ticker';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { noVisibilityChecks as noKeyboardVisibilityChecks } from '@micosmo/aframe/keyboard';

const _ = undefined;
const PositionStates = ['Loading', 'MainMenu', 'Newgame', 'Nextlevel', 'Playing', 'Endlevel', 'Endgame', 'Pause'];

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
    noKeyboardVisibilityChecks(); // Key listeners only inactive if related component is paused.
    this.recenterContext = { action: 'recenter' };
    this.SplashScreen = scene.querySelector('#SplashScreen');
    this.GameBoard = scene.querySelector('#GameBoard');
    this.Jukebox = scene.querySelector('[jukebox]');
    this.MainMenu = scene.querySelector('#MainMenu');
    this.PauseGame = scene.querySelector('#PauseGame');
    this.Game = scene.querySelector('#Game');
    this.Env1 = scene.querySelector('#env-1');
    this.Player = scene.querySelector('#player');
    this.Cursor = scene.querySelector('#cursor');
    this.el.sceneEl.systems.keyboard.addListeners(this);
    onLoadedDo(() => {
      this.compHeadless = scene.querySelector('[headless-controller]').components['headless-controller'];
    });
  },

  update(oldData) {
    if (oldData.state !== this.data.state && this.initialised) {
      // Wait for play to start before emitting game state changes
      // Should only be ignoring 'Loading' anyway
      this.compStates.chain(this.data.state);
    }
    if (!this.compStates && !this.el.getAttribute('states'))
      this.el.setAttribute('states', { list: this.data.states, event: 'gamestatechanged' });
    this.compStates = this.el.components.states;
  },

  startupComplete: bindEvent(function () {
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
    })
    //    for (var el of this.GameBoard.children)
    //      if (el.id) el.pause(); // Pause all the gameboard children that are named.
    this.GameBoard.pause();
    this.SplashScreen.pause();
    this.PauseGame.pause();
    this.Player.pause();
    this.compStates.chain(this.data.state);
  }),

  // Recenter state is a simple flip/flop to pause the element in focus.
  startrecenter: bindEvent({ target: '#scene' }, function () {
    this.compStates.call('Recenter', this.recenterContext);
  }),
  endrecenter: bindEvent({ target: '#scene' }, function () {
    this.compStates.return(_, _, this.recenterContext);
  }),

  gamestatechanged: bindEvent(function (evt) {
    const detail = evt.detail;
    this.oldData.state = this.data.state = detail.to.state; // Keep gamestate data up to date.
    console.info(`micosmo:component:gamestate:gamestatechanged: '${detail.from.state}' to '${detail.to.state}' by '${detail.op}'`);
    var statePosition = this.statePositions[detail.from.state];
    if (statePosition && detail.from.action === 'exit') {
      statePosition.playerPosition.copy(this.Player.object3D.position);
      statePosition.playerOffset.copy(this.compRecenter.playerOffset);
    }
    statePosition = this.statePositions[detail.to.state];
    if (statePosition && detail.to.action === 'enter') {
      this.Player.object3D.position.copy(statePosition.playerPosition);
      this.compRecenter.playerOffset.copy(statePosition.playerOffset);
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
  recenterNewgame() { recenterElement(this, this.Game) },

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
    this.Cursor.components['headless-controller'].toggleCursor();
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

/*
*  Ask Adam.
window.newgame = () => {
  document.querySelector('[game-state]').setAttribute('game-state', { state: 'NewGame' });
};
*/
