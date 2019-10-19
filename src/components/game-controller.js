import aframe from "aframe";
import { bindEvent } from "aframe-event-decorators";
import { onLoadedDo } from "@micosmo/aframe/startup";

export const ControlMap = getControlMap();
export const ControllerMap = getControllerMap();

aframe.registerSystem("game-controller", {
  init() {
    this.controllers = Object.create(null);
    this.attachedControllers = Object.create(null);
  },
  addController(gc) { this.controllers[gc.data] = gc },
  removeController(gc) { delete this.controllers[gc.data]; delete this.attachedControllers[gc.data] },
  addAttachedController(gc) { this.attachedControllers[gc.data] = gc },
  removeAttachedController(gc) { delete this.attachedControllers[gc.data] },
  addListeners(comp, ...ctrlSpecs) {
    onLoadedDo(() => {
      if (!comp.el.components.ctrlmap) {
        console.warn(`micosmo:system:game-controller:addListeners: Missing ctrlmap component for element '${comp.el.id || '<anonymous>'}'`);
        return;
      }
      //      console.log('micosmo:system:game-controller:addListeners: Processing ctrlmap for', comp.attrName, ctrlSpecs, comp.el.components.ctrlmap.mappings);
      addListeners(comp.el.components.ctrlmap, comp, ctrlSpecs)
    });
  },
  tryAddListeners(comp, ...ctrlSpecs) {
    onLoadedDo(() => {
      if (!comp.el.components.ctrlmap)
        return;
      //      console.log('micosmo:system:game-controller:tryAddListeners: Processing ctrlmap for', comp.attrName, ctrlSpecs, comp.el.components.ctrlmap.mappings);
      addListeners(comp.el.components.keymap, comp, ctrlSpecs)
    });
  },
  removeListeners(comp, ...ids) {
    if (comp.el.components.ctrlmap)
      removeListeners(comp.el.components.ctrlmap, comp, ids);
  },
});

export function addListeners(cm, comp, ctrlSpecs) {
  const gcSys = comp.el.sceneEl.systems['game-controller'];
  const idMap = cm.mappings.idMap;
  if (ctrlSpecs.length === 1 && Array.isArray(ctrlSpecs[0]))
    ctrlSpecs = ctrlSpecs[0];
  if (ctrlSpecs.length === 0)
    ctrlSpecs = Object.keys(idMap); // Listen to all key ids for the keymap
  ctrlSpecs.forEach(spec => {
    if (typeof spec === 'string')
      spec = { id: spec }; // Only have an id so build a dummy spec
    const ctrls = idMap[spec.id];
    if (!ctrls)
      return; // No mapping so ignore ctrl id
    ctrls.forEach(ctrl => mapToControllers(gcSys, cm, comp, spec, ctrl));
  });
}

export function removeListeners(cm, comp, ids) {
  const gcSys = comp.el.sceneEl.systems['game-controller'];
  const idMap = cm.mappings.idMap;
  if (ids.length === 1 && Array.isArray(ids[0]))
    ids = ids[0];
  if (ids.length === 0)
    ids = Object.keys(idMap); // Remove all key ids for the keymap
  ids.forEach(id => {
    const ctrls = idMap[id];
    if (!ctrls) return; // No mapping so ignore ctrl id
    ctrls.forEach(ctrl => {
      const ctrlEnt = ControllerMap[ctrl]; const ctrlData = ControlMap[ctrlEnt.family];
      ctrlData.events.forEach(event => {
        const actEvent = `${ctrlData.actual}${event}`;
        // Map listener record to the supporting controllers.
        gcSys.controllers.forEach(gc => {
          if (!ctrlEnt[gc.data]) return; // Our logical control does not map to this game controller.
          const records = gc.gameListeners.get(actEvent);
          if (records) {
            const i = records.findIndex(l => l.comp === comp && l.id === id);
            if (i >= 0) records.splice(i, 1);
          }
        })
      })
    });
  });
}

function mapToControllers(gcSys, cm, comp, spec, ctrl) {
  const ctrlEnt = ControllerMap[ctrl]; const ctrlData = ControlMap[ctrlEnt.family];
  ctrlData.events.forEach(event => {
    const listener = getListener(comp, spec, event);
    if (!listener) return;
    const actEvent = `${ctrlData.actual}${event}`;
    const gameListener = { cm, comp, id: spec.id, event, actEvent, listener };
    // Map listener record to the supporting controllers.
    gcSys.controllers.forEach(gc => {
      if (!ctrlEnt[gc.data]) return; // Our logical control does not map to this game controller.
      addGameListener(gc, gameListener);
      // Make sure our game controller can handle this event
      if (gc.controllerListeners[actEvent]) return;
      gc.controllerListeners[actEvent] = evt => dispatchEvent(gc, evt, actEvent);
      if (gc.controllerPresent)
        gc.el.addEventListener(actEvent, gc.controllerListeners[actEvent]);
    })
  })
}

function addGameListener(gc, gameListener) {
  const records = gc.gameListeners.get(gameListener.actEvent);
  if (records) {
    const i = records.findIndex(l => l.comp === gameListener.comp && l.id === gameListener.id);
    records[i < 0 ? records.length : i] = gameListener; // Update or add to the end
  } else
    gc.gameListeners.set(gameListener.actEvent, [gameListener]); // Start a new list for event.
}

function getListener(comp, spec, sEvt) {
  const sIdEvt = `${spec.id}_${sEvt}`; const sIdEvt1 = `${spec.id}${sEvt}`;
  var fEvt = spec[sEvt];
  if (fEvt) return fEvt;
  if ((fEvt = comp[sIdEvt] && comp[sIdEvt].bind(comp))) return fEvt; // Ex. grip_up
  if ((fEvt = comp[sIdEvt1] && comp[sIdEvt1].bind(comp))) return fEvt; // Ex. gripup
  return comp[spec.id] && comp[spec.id].bind(comp); // Ex. grip
}

function dispatchEvent(gc, evt, actEvent) {
  if (!gc.controllerPresent) return;
  const records = gc.gameListeners.get(actEvent);
  if (!records) return false;
  for (var gameListener of records) {
    if (gameListener.cm.isPaused) continue; // Ignore paused ctrlmaps
    if (gameListener.listener(gameListener.id, gameListener.event, evt)) {
      // Event has been captured, go no further
      return true;
    }
  }
  return false;
}

aframe.registerComponent("game-controller", {
  schema: { default: "left" },
  init() {
    this.gameListeners = new Map();
    this.controllerListeners = Object.create(null);
    this.controllerPresent = false;
  },
  /*
  init() {
    const el = this.el;
    // Active buttons populated by events provided by the attached controls.
    this.pressedButtons = {};
    this.touchedButtons = {};

    this.onGripDown = () => { this.handleButton("grip", "down") };
    this.onGripUp = () => { this.handleButton("grip", "up") };
    this.onTrackpadDown = () => { this.handleButton("trackpad", "down") };
    this.onTrackpadUp = () => { this.handleButton("trackpad", "up") };
    this.onTrackpadTouchStart = () => { this.handleButton("trackpad", "touchstart") };
    this.onTrackpadTouchEnd = () => { this.handleButton("trackpad", "touchend") };
    this.onTriggerDown = () => { this.handleButton("trigger", "down") };
    this.onTriggerUp = () => { this.handleButton("trigger", "up") };
    this.onTriggerTouchStart = () => { this.handleButton("trigger", "touchstart") };
    this.onTriggerTouchEnd = () => { this.handleButton("trigger", "touchend") };
    this.onGripTouchStart = () => { this.handleButton("grip", "touchstart") };
    this.onGripTouchEnd = () => { this.handleButton("grip", "touchend") };
    this.onThumbstickDown = () => { this.handleButton("pause", "down") };
    this.onThumbstickUp = () => { this.handleButton("pause", "up") };
    this.onMenuDown = () => { this.handleButton("pause", "down") };
    this.onMenuUp = () => { this.handleButton("pause", "up") };
    this.onAorXTouchStart = () => { this.handleButton("AorX", "touchstart") };
    this.onAorXTouchEnd = () => { this.handleButton("AorX", "touchend") };
    this.onBorYTouchStart = () => { this.handleButton("BorY", "touchstart") };
    this.onBorYTouchEnd = () => { this.handleButton("BorY", "touchend") };
    this.onSurfaceTouchStart = () => { this.handleButton("surface", "touchstart") };
    this.onSurfaceTouchEnd = () => { this.handleButton("surface", "touchend") };
    this.onAorXDown = () => { this.handleButton("AorX", "down") };

    // Specialised events to handle special game states
    this.onEndRecentering = () => { this.handleEndRecenter("grip", "up") };
    this.onEndGamePause = function () {
      this.handleEndGamePause("pause", "down");
    };
    this.onPauseGripDown = function () {
      this.isRecentering = true;
    };
    this.onPauseGripUp = function () {
      this.isRecentering = false;
    };

    this.player = document.querySelector("#player");
    // Save all the registered game controllers in the player.
    if (!this.player.game_controllers)
      this.player.game_controllers = [this];
    else
      this.player.game_controllers.push(this);
    // Get the element that owns the 'game-state' property.
    this.gameState = document.querySelector("[game-state]");
    // Grab the game pause element to display if explicit pause requested.
    this.gamePaused = document.querySelector('#gamePaused');

    this.isRecentering = false;
    this.ready = false;
  },
  */
  update(oldData) {
    if (oldData) {
      if (oldData !== this.data)
        throw new Error(`micosmo:component:game-controller:update: Update to '${this.data}' is not supported`);
      return;
    }
    const el = this.el;
    // Get common configuration to abstract different vendor controls.
    const controlConfiguration = { hand: this.data, model: true };
    el.setAttribute("vive-controls", controlConfiguration);
    el.setAttribute("oculus-touch-controls", controlConfiguration);
    el.setAttribute("windows-motion-controls", controlConfiguration);
    this.system.addController(this);
  },
  remove() {
    this.system.removeController(this);
  },
  controllerconnected: bindEvent(function (evt) {
    console.info(`micosmo:component:game-controller: ${this.data} controller connected`);
    this.el.object3D.visible = true;
    this.controllerPresent = true;
    this.system.addAttachedController(this);
    addEventListeners(this);
  }),
  controllerdisconnected: bindEvent(function (evt) {
    console.info(`micosmo:component:game-controller: ${this.data} controller disconnected`);
    this.el.object3D.visible = false;
    this.controllerPresent = false;
    removeEventListeners(this);
    this.system.removeAttachedController(this);
  }),

  startCentering: function () {
    /*
    this.pauseControllers(this.onEndRecentering, "gripup");
    this.gamePausedEl.emit('startPause', {
      displayPause: false,
      endCallback: () => {
        this.isRecentering = false;
        this.playControllers(this.onEndRecentering, "gripup");
      }
    });
    */
    this.isRecentering = true;
  },

  endCentering: function () {
    this.isRecentering = false;
    /*
    this.gamePausedEl.emit('endPause', { displayPause: false });
    this.playControllers(this.onEndRecentering, "gripup");
    */
  },

  startGamePause: function () {
    this.pauseControllers(this.onEndGamePause, "thumbstickdown", "menudown");
    this.el.addEventListener("gripdown", this.onPauseGripDown);
    this.el.addEventListener("gripup", this.onPauseGripUp);
    this.gamePausedEl.emit('startPause', {
      displayPause: true,
      endCallback: () => {
        this.el.removeEventListener("gripdown", this.onPauseGripDown);
        this.el.removeEventListener("gripup", this.onPauseGripUp);
        this.playControllers(this.onEndGamePause, "thumbstickdown", "menudown");
      }
    });
  },

  endGamePause: function () {
    this.gamePausedEl.emit('endPause', { displayPause: true });
    this.el.removeEventListener("gripdown", this.onPauseGripDown);
    this.el.removeEventListener("gripup", this.onPauseGripUp);
    this.playControllers(this.onEndGamePause, "thumbstickdown", "menudown");
  },

  pauseControllers(endFn, endEvt1, endEvt2) {
    this.playerEl.game_controllers.forEach(gc => {
      gc.removeEventListeners();
      gc.el.addEventListener(endEvt1, endFn);
      if (endEvt2)
        gc.el.addEventListener(endEvt2, endFn);
    });
  },

  playControllers(endFn, endEvt1, endEvt2) {
    this.playerEl.game_controllers.forEach(gc => {
      gc.el.removeEventListener(endEvt1, endFn);
      if (endEvt2)
        gc.el.removeEventListener(endEvt2, endFn);
      gc.addEventListeners();
    });
  },

  tick: function (time, delta) {
    if (this.isRecentering) {
      this.playerEl.components.recenter.around(this.el);
    }
    /*
    const isOculus = this.el.components["oculus-touch-controls"]
      .controllerPresent;
    if (!this.oculusInstructionsSet && isOculus) {
      document
        .querySelector("#launchOmegaInstructions")
        .setAttribute(
          "text__omega",
          "value",
          "A      OR      X      BUTTONS      TO      LAUNCH      OMEGA      MISSILE"
        );
      this.oculusInstructionsSet = true;
    }
    */
    /*
        var mesh = this.el.getObject3D("mesh");

        if (!mesh || !mesh.mixer) {
          return;
        }

        mesh.mixer.update(delta / 1000);
    */
  },
  /*
  gamestatechanged: bindEvent({ target: "[game-state]" }, function (evt) {
    const newState = evt.detail;
    if (newState === 'Loading') {
      this.ready = true;
    }
  }),
  */

  /**
   *
   * @param {string} button - Name of the button.
   * @param {string} evt - Type of event for the button (i.e., down/up/touchstart/touchend).
   */
  handleButton: function (button, evt) {
    if (!this.ready) return;
    /*
    const isAdvancedControls = this.gameStateEl.components["game-state"].isAdvancedControls();
    if (button.indexOf("trigger") === 0 && evt.indexOf("down") === 0) {
      this.el.components["launch-controls"].launch(isAdvancedControls);
    } else if (
      (button.indexOf("trackpad") === 0 || button.indexOf("AorX") === 0) &&
      evt.indexOf("down") === 0 &&
      isAdvancedControls
    ) {
      this.el.components["launch-controls"].launchOmega();
    */
    if (button.indexOf("grip") === 0 && evt.indexOf("down") === 0) {
      // Have a problem with the Oculus Rift sending 'down' events before
      // 'touchstart' events. Results in the 'isRecentering' flag being
      // cleared straight after we set it.
      // Changed to explicitly handle 'down' and 'up' events only
      // Recentering handled by separate event handler
      this.startCentering();
    }
    /*
    } else if (button.indexOf("pause") === 0 && evt.indexOf("down") === 0) {
      // Game pause handled by separate event handler
      // Use thumbstick on Oculus Touch and menu button on Vive
      this.startGamePause();
    }
    */
  },

  handleEndRecenter: function (button, evt) {
    if (button.indexOf("grip") === 0 && evt.indexOf("up") === 0) {
      // Only accept gripup events. Ignore anything else which shouldn't happen.
      this.endCentering();
    }
  },

  handleEndGamePause: function (button, evt) {
    if (button.indexOf("pause") === 0 && evt.indexOf("down") === 0) {
      // Only accept thumbstickdown or systemdown events.
      // Ignore anything else which shouldn't happen.

      //      this.endGamePause();
    }
  }
});

function addEventListeners(gc) {
  const el = gc.el;
  for (var event in gc.controllerListeners)
    el.addEventListener(event, gc.controllerListeners[event]);
}

function removeEventListeners(gc) {
  const el = gc.el;
  for (var event in gc.controllerListeners)
    el.removeEventListener(event, gc.controllerListeners[event]);
}

function getControlMap() {
  return Object.freeze({
    grip: { actual: 'grip', events: ['up', 'down', 'touchstart', 'touchend', 'changed'] },
    pad: { actual: 'trackpad', events: ['up', 'down', 'changed'] },
    trig: { actual: 'trigger', events: ['up', 'down', 'touchstart', 'touchend', 'changed'] },
    stick: { actual: 'thumbstick', events: ['up', 'down', 'touchstart', 'touchend', 'changed'] },
    menu: { actual: 'menu', events: ['up', 'down', 'changed'] },
    surf: { actual: 'surface', events: ['up', 'down', 'touchstart', 'touchend', 'changed'] },
    sys: { actual: 'system', events: ['up', 'down', 'changed'] },
    a: { actual: 'abutton', events: ['up', 'down', 'touchstart', 'touchend', 'changed'] },
    b: { actual: 'bbutton', events: ['up', 'down', 'touchstart', 'touchend', 'changed'] },
    x: { actual: 'xbutton', events: ['up', 'down', 'touchstart', 'touchend', 'changed'] },
    y: { actual: 'ybutton', events: ['up', 'down', 'touchstart', 'touchend', 'changed'] },
  })
}

function getControllerMap() {
  return Object.freeze({
    grip: { family: 'grip', left: true, right: true },
    lgrip: { family: 'grip', left: true },
    leftgrip: { family: 'grip', left: true },
    rgrip: { family: 'grip', right: true },
    rightgrip: { family: 'grip', right: true },
    pad: { family: 'pad', left: true, right: true },
    lpad: { family: 'pad', left: true },
    leftpad: { family: 'pad', left: true },
    rpad: { family: 'pad', right: true },
    rightpad: { family: 'pad', right: true },
    trackpad: { family: 'pad', left: true, right: true },
    ltrackpad: { family: 'pad', left: true },
    lefttrackpad: { family: 'pad', left: true },
    rtrackpad: { family: 'pad', right: true },
    righttrackpad: { family: 'pad', right: true },
    trig: { family: 'trig', left: true, right: true },
    ltrig: { family: 'trig', left: true },
    rtrig: { family: 'trig', right: true },
    trigger: { family: 'trig', left: true, right: true },
    ltrigger: { family: 'trig', left: true },
    lefttrigger: { family: 'trig', left: true },
    rtrigger: { family: 'trig', right: true },
    righttrigger: { family: 'trig', right: true },
    stick: { family: 'stick', left: true, right: true },
    lstick: { family: 'stick', left: true },
    leftstick: { family: 'stick', left: true },
    rstick: { family: 'stick', right: true },
    rightstick: { family: 'stick', right: true },
    thumbstick: { family: 'stick', left: true, right: true },
    lthumbstick: { family: 'stick', left: true },
    leftthumbstick: { family: 'stick', left: true },
    rthumbstick: { family: 'stick', right: true },
    rightthumbstick: { family: 'stick', right: true },
    menu: { family: 'menu', left: true, right: true },
    lmenu: { family: 'menu', left: true },
    leftmenu: { family: 'menu', left: true },
    rmenu: { family: 'menu', right: true },
    rightmenu: { family: 'menu', right: true },
    surf: { family: 'surf', left: true, right: true },
    lsurf: { family: 'surf', left: true },
    leftsurf: { family: 'surf', left: true },
    rsurf: { family: 'surf', right: true },
    rightsurf: { family: 'surf', right: true },
    surface: { family: 'surf', left: true, right: true },
    lsurface: { family: 'surf', left: true },
    leftsurface: { family: 'surf', left: true },
    rsurface: { family: 'surf', right: true },
    rightsurface: { family: 'surf', right: true },
    sys: { family: 'sys', left: true, right: true },
    lsys: { family: 'sys', left: true },
    leftsys: { family: 'sys', left: true },
    rsys: { family: 'sys', right: true },
    rightsys: { family: 'sys', right: true },
    system: { family: 'sys', left: true, right: true },
    lsystem: { family: 'sys', left: true },
    leftsystem: { family: 'sys', left: true },
    rsystem: { family: 'sys', right: true },
    rightsystem: { family: 'sys', right: true },
    a: { family: 'a', left: true, right: true },
    abut: { family: 'a', left: true, right: true },
    abutton: { family: 'a', left: true, right: true },
    b: { family: 'b', left: true, right: true },
    bbutton: { family: 'b', left: true, right: true },
    x: { family: 'x', left: true, right: true },
    xbutton: { family: 'x', left: true, right: true },
    y: { family: 'y', left: true, right: true },
    ybutton: { family: 'y', left: true, right: true },
  })
}
