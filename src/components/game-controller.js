import aframe from "aframe";
import { bindEvent } from "aframe-event-decorators";
import { onLoadedDo, afterLoadedDo } from "@micosmo/aframe/startup";
import { startProcess } from "@micosmo/ticker/aframe-ticker";

export const ControlMap = getControlMap();
export const ControllerMap = getControllerMap();

const RecenterContext = { action: 'recenter' };

aframe.registerSystem("game-controller", {
  init() {
    this.controllers = Object.create(null);
    this.attachedControllers = Object.create(null);
  },
  addController(gc) { this.controllers[gc.data.hand] = gc },
  removeController(gc) { delete this.controllers[gc.data.hand]; delete this.attachedControllers[gc.data.hand] },
  addAttachedController(gc) { this.attachedControllers[gc.data.hand] = gc },
  removeAttachedController(gc) { delete this.attachedControllers[gc.data.hand] },
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
      addListeners(comp.el.components.ctrlmap, comp, ctrlSpecs)
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
        for (var hand in gcSys.controllers) {
          const gc = gcSys.controllers[hand];
          if (!ctrlEnt[gc.data.hand]) continue; // Our logical control does not map to this game controller.
          const records = gc.gameListeners.get(actEvent);
          if (records) {
            const i = records.findIndex(l => l.comp === comp && l.id === id);
            if (i >= 0) records.splice(i, 1);
          }
        }
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
    // Map listener record to the supporting controllers.
    for (var hand in gcSys.controllers) {
      const gc = gcSys.controllers[hand];
      if (!ctrlEnt[gc.data.hand]) continue; // Our logical control does not map to this game controller.
      const gameListener = { gc, cm, comp, id: spec.id, event, actEvent, listener };
      console.log('mapToController', gc.data.hand, gameListener);
      addGameListener(gc, gameListener);
      // Make sure our game controller can handle this event
      if (gc.controllerListeners[actEvent]) continue;
      gc.controllerListeners[actEvent] = evt => dispatchEvent(gc, evt, actEvent);
      console.log('mapToController:ControllerListener', gc.data.hand, actEvent);
      if (gc.controllerPresent)
        gc.el.addEventListener(actEvent, gc.controllerListeners[actEvent]);
    }
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
    if (gameListener.listener(evt, gameListener.gc, gameListener.event)) {
      // Event has been captured, go no further
      return true;
    }
  }
  return false;
}

aframe.registerComponent("game-controller", {
  schema: {
    hand: { default: "left" }
  },
  init() {
    this.RecenterEl = this.el.sceneEl.querySelector('[recenter]');
    this.gameListeners = new Map();
    this.controllerListeners = Object.create(null);
    this.controllerPresent = false;
    this.ready = false;
    this.system.tryAddListeners(this);
    afterLoadedDo(() => {
      this.ready = true;
      if (this.controllerPresent)
        addEventListeners(this);
    });
  },
  update(oldData) {
    if (this.ready)
      throw new Error(`micosmo:component:game-controller:update: Updates are not supported`);
    if (oldData.hand !== this.data.hand) {
      const el = this.el;
      // Get common configuration to abstract different vendor controls.
      const controlConfiguration = { hand: this.data.hand, model: true };
      el.setAttribute("vive-controls", controlConfiguration);
      el.setAttribute("oculus-touch-controls", controlConfiguration);
      el.setAttribute("windows-motion-controls", controlConfiguration);
      this.system.addController(this);
    }
  },
  remove() {
    this.system.removeController(this);
  },
  controllerconnected: bindEvent(function (evt) {
    console.info(`micosmo:component:game-controller: ${this.data.hand} controller connected`);
    this.el.object3D.visible = true;
    this.controllerPresent = true;
    this.system.addAttachedController(this);
    if (this.ready)
      addEventListeners(this);
  }),
  controllerdisconnected: bindEvent(function (evt) {
    console.info(`micosmo:component:game-controller: ${this.data.hand} controller disconnected`);
    this.el.object3D.visible = false;
    this.controllerPresent = false;
    if (this.ready)
      removeEventListeners(this);
    this.system.removeAttachedController(this);
  }),

  grip_down() {
    // From state gets a recenter action. Allows simple flip flop of pause.
    if (!this.RecenterEl)
      return false;
    this.recentering = true;
    this.el.sceneEl.components.states.call('Recenter', RecenterContext);
    this.recenterProcess = startProcess(() => { this.RecenterEl.components.recenter.around(this.el); return 'more' })
  },
  grip_up() {
    // Return state gets another recenter action. Allows simple flip of pause.
    if (!this.recentering)
      return false;
    this.recenterProcess.stop();
    this.recentering = false;
    this.el.sceneEl.components.states.return(undefined, undefined, RecenterContext);
  },
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
