import aframe from "aframe";
import { bindEvent } from "aframe-event-decorators";
import { requestObject, returnObject, removeIndex } from "@micosmo/core/object";
import { onLoadedDo, afterLoadedDo } from "@micosmo/aframe/startup";
import { createProcess } from "@micosmo/ticker/aframe-ticker";
import { instantiateDatagroup } from '@micosmo/aframe/lib/utils';

export const ControlMap = getControlMap();
export const ControllerMap = getControllerMap();

aframe.registerComponent("controller", {
  schema: {
    hand: { default: "left" },
    visible: { default: true }, // Defines if the controller model should be displayed when the controller is present
    touch: { default: '' } // Datagroup that describes how a controller can touch elements in the scene.
  },
  init() {
    this.Recenter = this.el.sceneEl.querySelector('[recenter]');
    this.listeners = new Map();
    this.controllerListeners = Object.create(null);
    this.controllerPresent = false;
    this.ready = false;
    if (this.Recenter) {
      onLoadedDo(() => {
        this.compRecenter = this.Recenter.components.recenter;
        this.recenterProcess = createProcess(() => { this.compRecenter.around(this.el); return 'more' })
      });
      this.system.tryAddListeners(this);
    }
    afterLoadedDo(() => {
      this.ready = true;
      if (this.controllerPresent)
        addEventListeners(this);
    });
  },
  update(oldData) {
    if (oldData.hand !== this.data.hand) {
      if (this.ready)
        throw new Error(`micosmo:component:controller:update: Updates to controller configuration not supported`);
      const el = this.el;
      // Get common configuration to abstract different vendor controls.
      const controlConfiguration = { hand: this.data.hand, model: true };
      el.setAttribute("vive-controls", controlConfiguration);
      el.setAttribute("oculus-touch-controls", controlConfiguration);
      el.setAttribute("windows-motion-controls", controlConfiguration);
      el.setAttribute('tracked-controls', 'autoHide', false);
      this.system.addController(this);
    }
    if (oldData.visible !== this.data.visible && this.controllerPresent)
      this.el.object3D.visible = this.data.visible;

    if (oldData.touch !== this.data.touch) {
      if (this.Touch)
        this.el.removeChild(this.Touch);
      if (this.data.touch !== '')
        this.el.appendChild(this.Touch = instantiateDatagroup(this.el.sceneEl.systems.dataset.getDatagroup(this.data.touch)));
    }
  },
  remove() {
    this.system.removeController(this);
  },

  controllerconnected: bindEvent(function (evt) {
    console.info(`micosmo:component:controller: ${this.data.hand} controller connected`);
    if (this.el.sceneEl.is('vr-mode'))
      this.el.object3D.visible = this.data.visible;
    this.controllerPresent = true;
    this.system.addAttachedController(this);
    if (this.ready)
      addEventListeners(this);
  }),
  controllerdisconnected: bindEvent(function (evt) {
    console.info(`micosmo:component:controller: ${this.data.hand} controller disconnected`);
    this.el.object3D.visible = false;
    this.controllerPresent = false;
    if (this.ready)
      removeEventListeners(this);
    this.system.removeAttachedController(this);
  }),
  'enter-vr': bindEvent({ target: 'a-scene' }, function (evt) {
    if (!this.controllerPresent)
      return;
    if (!this.el.object3D.visible)
      this.el.object3D.visible = this.data.visible;
  }),
  'exit-vr': bindEvent({ target: 'a-scene' }, function (evt) {
    if (!this.controllerPresent)
      return;
    if (this.el.object3D.visible)
      this.el.object3D.visible = false;
  }),

  recenter_down() {
    this.compRecenter.start();
    this.el.sceneEl.emit('startrecenter', undefined, false);
    this.recenterProcess.start();
    return true;
  },
  recenter_up() {
    this.recenterProcess.stop();
    this.el.sceneEl.emit('endrecenter', undefined, false);
    this.compRecenter.stop();
    return true;
  },
});

function addEventListeners(ctlr) {
  const el = ctlr.el;
  for (var event in ctlr.controllerListeners)
    el.addEventListener(event, ctlr.controllerListeners[event]);
}

function removeEventListeners(ctlr) {
  const el = ctlr.el;
  for (var event in ctlr.controllerListeners)
    el.removeEventListener(event, ctlr.controllerListeners[event]);
}

aframe.registerSystem("controller", {
  init() {
    this.controllers = Object.create(null);
    this.attachedControllers = Object.create(null);
  },
  addController(ctlr) { this.controllers[ctlr.data.hand] = ctlr },
  removeController(ctlr) { delete this.controllers[ctlr.data.hand]; delete this.attachedControllers[ctlr.data.hand] },
  addAttachedController(ctlr) { this.attachedControllers[ctlr.data.hand] = ctlr },
  removeAttachedController(ctlr) { delete this.attachedControllers[ctlr.data.hand] },
  addListeners(comp, ...ctrlSpecs) {
    onLoadedDo(() => {
      if (!comp.el.components.ctrlmap) {
        console.warn(`micosmo:system:controller:addListeners: Missing ctrlmap component for element '${comp.el.id || '<anonymous>'}'`);
        return;
      }
      //      console.log('micosmo:system:controller:addListeners: Processing ctrlmap for', comp.attrName, ctrlSpecs, comp.el.components.ctrlmap.mappings);
      addListeners(comp.el.components.ctrlmap, comp, ctrlSpecs)
    });
  },
  tryAddListeners(comp, ...ctrlSpecs) {
    onLoadedDo(() => {
      if (!comp.el.components.ctrlmap)
        return;
      //      console.log('micosmo:system:controller:tryAddListeners: Processing ctrlmap for', comp.attrName, ctrlSpecs, comp.el.components.ctrlmap.mappings);
      addListeners(comp.el.components.ctrlmap, comp, ctrlSpecs)
    });
  },
  removeListeners(comp, ...ids) {
    if (comp.el.components.ctrlmap)
      removeListeners(comp.el.components.ctrlmap, comp, ids);
  },
});

export function addListeners(cm, comp, ctrlSpecs) {
  const sysCtlr = comp.el.sceneEl.systems.controller;
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
    ctrls.forEach(ctrl => mapToControllers(sysCtlr, cm, comp, spec, ctrl));
  });
}

function mapToControllers(sysCtlr, cm, comp, spec, ctrl) {
  const ctrlEnt = ControllerMap[ctrl]; const ctrlData = ControlMap[ctrlEnt.family];
  ctrlData.events.forEach(event => {
    const listener = getListener(comp, spec, event);
    if (!listener) return;
    const actEvent = `${ctrlData.actual}${event}`;
    // Map listener record to the supporting controllers.
    for (var hand in sysCtlr.controllers) {
      const ctlr = sysCtlr.controllers[hand];
      if (!ctrlEnt[ctlr.data.hand]) continue; // Our logical control does not map to this game controller.
      // { ctlr, cm, comp, id: spec.id, event, actEvent, listener };
      const lr = requestObject();
      lr.ctlr = ctlr; lr.cm = cm; lr.comp = comp; lr.id = spec.id; lr.event = event; lr.actEvent = actEvent; lr.listener = listener;
      addListenerRecord(ctlr, lr);
      // Make sure our controller can handle this event
      if (ctlr.controllerListeners[actEvent]) continue;
      ctlr.controllerListeners[actEvent] = evt => dispatchEvent(ctlr, evt, actEvent);
      if (ctlr.controllerPresent)
        ctlr.el.addEventListener(actEvent, ctlr.controllerListeners[actEvent]);
    }
  })
}

function addListenerRecord(ctlr, listenerRecord) {
  const records = ctlr.listeners.get(listenerRecord.actEvent);
  if (records) {
    const i = records.findIndex(l => l.comp === listenerRecord.comp && l.id === listenerRecord.id);
    if (i >= 0) { returnObject(records[i]); records[i] = listenerRecord } else records.push(listenerRecord);
  } else
    ctlr.listeners.set(listenerRecord.actEvent, [listenerRecord]); // Start a new list for event.
}

function getListener(comp, spec, sEvt) {
  const sIdEvt = `${spec.id}_${sEvt}`; const sIdEvt1 = `${spec.id}${sEvt}`;
  var fEvt = spec[sEvt];
  if (fEvt) return fEvt;
  if (typeof comp[sIdEvt] === 'function' && (fEvt = comp[sIdEvt].bind(comp))) return fEvt; // Ex. grip_up
  if (typeof comp[sIdEvt1] === 'function' && (fEvt = comp[sIdEvt1].bind(comp))) return fEvt; // Ex. gripup
  return typeof comp[spec.id] === 'function' && comp[spec.id].bind(comp); // Ex. grip
}

export function removeListeners(cm, comp, ids) {
  const sysCtlr = comp.el.sceneEl.systems.controller;
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
        for (var hand in sysCtlr.controllers) {
          const ctlr = sysCtlr.controllers[hand];
          if (!ctrlEnt[ctlr.data.hand]) continue; // Our logical control does not map to this game controller.
          const records = ctlr.listeners.get(actEvent);
          if (records) {
            const i = records.findIndex(l => l.comp === comp && l.id === id);
            if (i >= 0) returnObject(removeIndex(records, i));
          }
        }
      })
    });
  });
}

function dispatchEvent(ctlr, evt, actEvent) {
  if (!ctlr.controllerPresent) return;
  const records = ctlr.listeners.get(actEvent);
  if (!records) return false;
  for (var listenerRecord of records) {
    if (listenerRecord.cm.isPaused) continue; // Ignore paused ctrlmaps
    if (listenerRecord.listener(evt, listenerRecord.ctlr, listenerRecord.event)) {
      // Event has been captured, go no further
      return true;
    }
  }
  return false;
}

function getControlMap() {
  return Object.freeze({
    grip: { actual: 'grip', events: ['up', 'down', 'touchstart', 'touchend', 'changed'] },
    pad: { actual: 'trackpad', events: ['up', 'down', 'changed', 'moved'] },
    trig: { actual: 'trigger', events: ['up', 'down', 'touchstart', 'touchend', 'changed'] },
    stick: { actual: 'thumbstick', events: ['up', 'down', 'touchstart', 'touchend', 'changed', 'moved'] },
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
    lefttrig: { family: 'trig', left: true },
    righttrig: { family: 'trig', right: true },
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
