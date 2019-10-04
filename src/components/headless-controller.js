/* global THREE */

import aframe from 'aframe';
import * as ticker from '@micosmo/ticker/aframe-ticker';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { bindEvent } from 'aframe-event-decorators/event-binder';
import { isVisibleInScene } from '@micosmo/aframe/lib/utils';
import { declareMethods, method, requestObject, returnObject } from '@micosmo/core';

declareMethods(triggerUp, fTriggerCacheTimeout);

var flHMDDetected = undefined; // Require 3 checkable states.
var cursorEl, cameraEl, targetEl, triggerEl;
var triggerCache;
var initialised = false;

const cursorCameraPosition = new THREE.Vector3();
const saveCameraPosition = new THREE.Vector3();
const cameraAdjustment = new THREE.Vector3(0, 0, 0);

aframe.registerComponent("headless-controller", {
  schema: {
    rayClass: { type: 'string', default: '.cursor-none' },
    rayInterval: { type: 'int', default: 0 },
    triggerCacheTimeout: { type: 'number', default: 0.0 },
    cameraAdjust: { type: 'vec3' },
    triggers: { type: 'array', default: [] }
  },
  dependencies: ['cursor', 'raycaster', 'geometry', 'material'],
  init() {
    if (initialised)
      throw new Error(`micosmo:component:headless-controller:init: Only one headless-controller permitted`);
    cursorEl = this.el;
    cameraEl = this.el.sceneEl.querySelector('[camera]');
    this.el.sceneEl.systems.keyboard.addListeners(this);
    onLoadedDo(() => {
      headlessReady();
      cursorCameraPosition.copy(cameraEl.object3D.position);
      saveCameraPosition.copy(cursorCameraPosition);
    });
    this.triggerTimer = ticker.createProcess(ticker.msWaiter(100, method(triggerUp).bind(this)));
    this.triggerCacheTimeout = ticker.createProcess(method(fTriggerCacheTimeout).bind(this));
    initialised = true;
  },
  update(oldData) {
    if (oldData.rayClass !== this.data.rayClass) {
      cursorEl.setAttribute('raycaster', { objects: this.data.rayClass, interval: this.data.rayInterval });
    }
    if (oldData.cameraAdjust !== this.data.cameraAdjust) {
      const v = this.data.cameraAdjust;
      cameraAdjustment.set(v.x, v.y, v.z);
    }
    if (oldData.triggers !== this.data.triggers) {
      this.el.sceneEl.systems.keyboard.removeListeners(this);
      applyOtherTriggers(this, oldData.triggers, this.data.triggers);
      this.el.sceneEl.systems.keyboard.addListeners(this);
    }
  },
  hasHMD() {
    return flHMDDetected;
  },
  toggleCursor() {
    if (cursorEl.components.raycaster.data.enabled) {
      cursorEl.object3D.visible = false;
      cameraEl.object3D.position.copy(saveCameraPosition);
      cursorEl.setAttribute('raycaster', 'enabled', 'false');
    } else {
      cursorEl.object3D.visible = true;
      saveCameraPosition.copy(cameraEl.object3D.position);
      cameraEl.object3D.position.add(cameraAdjustment);
      cursorEl.setAttribute('raycaster', 'enabled', 'true');
    }
  },
  startRaycaster(...args) { setRaycaster(this, ...args) },
  stopRaycaster() { setRaycaster(this, '.cursor-none', 0) },

  mouseenter: bindEvent(function (evt) {
    targetSelected(this, evt);
  }),
  mouseleave: bindEvent(function (evt) {
    targetDeselected(this, evt);
  }),
  click: bindEvent(function (evt) {
    this.keydown_Trigger();
  }),
  keydown_Trigger() {
    triggerDown(this, 'Trigger');
    return true;
  }
});

function setRaycaster(hlc, rayClass, interval = 125, cacheTimeout = 0) {
  const o = requestObject();
  o.rayClass = rayClass; o.rayInterval = interval; o.triggerCacheTimeout = cacheTimeout;
  hlc.el.setAttribute(hlc.attrName, o);
  returnObject(o);
}

function applyOtherTriggers(hlc, oldTriggers, newTriggers) {
  if (oldTriggers)
    oldTriggers.forEach(id => delete hlc[`keydown_${id}`]);
  newTriggers.forEach(id => { hlc[`keydown_${id}`] = function () { triggerDown(hlc, id); return true; } });
}

function targetSelected(hlc, evt) {
  const el = evt.detail.intersectedEl;
  if (isVisibleInScene(el)) {
    targetEl = el;
    hlc.el.setAttribute('material', 'color', 'green');
    tryTriggerCache(hlc);
  }
}

function targetDeselected(hlc) {
  if (targetEl) {
    tryTriggerCache(hlc);
    targetEl = undefined;
  }
  hlc.el.setAttribute('material', 'color', 'red');
}

function tryTriggerCache(hlc) {
  if (!triggerCache)
    return;
  emitTriggerDown(hlc, targetEl, triggerCache);
  triggerCache = undefined;
  hlc.triggerCacheTimeout.stop();
}

function triggerDown(hlc, key) {
  if (triggerEl)
    return;
  if (targetEl) {
    emitTriggerDown(hlc, targetEl, key);
  } else if (hlc.data.triggerCacheTimeout > 0) {
    if (!triggerCache)
      hlc.triggerCacheTimeout.start();
    triggerCache = key;
  }
}

function emitTriggerDown(hlc, el, key) {
  const o = requestObject();
  o.triggerEl = el; o.key = key;
  (triggerEl = el).emit('triggerDown', o, false);
  returnObject(o);
  hlc.triggerTimer.start();
}

method(triggerUp);
function triggerUp() {
  if (triggerEl)
    triggerEl.emit('triggerUp', undefined, false);
  triggerEl = undefined;
}

method(fTriggerCacheTimeout);
function * fTriggerCacheTimeout() {
  yield ticker.msWaiter(this.data.triggerCacheTimeout);
  triggerCache = undefined;
}

function headlessReady() {
  if (aframe.utils.device.checkHeadsetConnected()) {
    flHMDDetected = true;
    console.info(`system:headless-controller:headlessReady: HMD device detected. Headless controller ready`);
    return;
  }
  console.info(`system:headless-controller:headlessReady: No HMD device. Headless controller ready`);
}
