/* global THREE */

import aframe from 'aframe';
import * as ticker from '@micosmo/ticker/aframe-ticker';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { bindEvent } from 'aframe-event-decorators/event-binder';
import { isVisibleInScene } from '@micosmo/aframe/lib/utils';
import { declareMethods, method, requestObject, returnObject, removeValue } from '@micosmo/core';

declareMethods(triggerUp, fTriggerCacheTimeout);

const MotionKeys = ['yup', 'ydown', 'xleft', 'xright', 'zin', 'zout'];

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
    if (this.el.sceneEl.querySelectorAll('[headless-controller]').length > 1)
      throw new Error(`micosmo:component:headless-controller:init: Only one headless-controller permitted`);
    this.Recenter = this.el.sceneEl.querySelector('[recenter]');
    if (this.Recenter)
      this.el.sceneEl.systems.keyboard.addListeners(this, 'Recenter');

    this.flHMDDetected = undefined; // Require 3 checkable states.
    this.Cursor = this.el;
    this.Camera = this.el.sceneEl.querySelector('[camera]');
    this.targetEl = this.triggerEl = this.triggerCache = undefined;
    this.cursorCameraPosition = new THREE.Vector3();
    this.saveCameraPosition = new THREE.Vector3();
    this.cameraAdjustment = new THREE.Vector3(0, 0, 0);

    this.triggers = ['Trigger'];
    this.el.sceneEl.systems.keyboard.addListeners(this, this.triggers);
    onLoadedDo(() => {
      headlessReady(this);
      this.cursorCameraPosition.copy(this.Camera.object3D.position);
      this.saveCameraPosition.copy(this.cursorCameraPosition);
    });
    this.triggerTimer = ticker.createProcess(ticker.msWaiter(100, method(triggerUp).bind(this)));
    this.triggerCacheTimeout = ticker.createProcess(method(fTriggerCacheTimeout).bind(this));
  },
  update(oldData) {
    if (oldData.rayClass !== this.data.rayClass) {
      this.Cursor.setAttribute('raycaster', { objects: this.data.rayClass, interval: this.data.rayInterval });
    }
    if (oldData.cameraAdjust !== this.data.cameraAdjust) {
      const v = this.data.cameraAdjust;
      this.cameraAdjustment.set(v.x, v.y, v.z);
    }
    if (oldData.triggers !== this.data.triggers) {
      this.el.sceneEl.systems.keyboard.removeListeners(this, this.triggers);
      applyOtherTriggers(this, oldData.triggers, this.data.triggers);
      this.el.sceneEl.systems.keyboard.addListeners(this, this.triggers);
    }
  },
  hasHMD() {
    return this.flHMDDetected;
  },
  toggleCursor() {
    if (this.Cursor.components.raycaster.data.enabled) {
      this.Cursor.object3D.visible = false;
      this.Camera.object3D.position.copy(this.saveCameraPosition);
      this.Cursor.setAttribute('raycaster', 'enabled', 'false');
    } else {
      this.Cursor.object3D.visible = true;
      this.saveCameraPosition.copy(this.Camera.object3D.position);
      this.Camera.object3D.position.add(this.cameraAdjustment);
      this.Cursor.setAttribute('raycaster', 'enabled', 'true');
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
  },

  keydown_Recenter() {
    if (!this.recentering) {
      console.log('Start Recentering')
      this.el.sceneEl.systems.keyboard.addListeners(this, MotionKeys);
      this.el.sceneEl.emit('startrecenter', undefined, false);
      this.recenterProcess = ticker.startProcess(() => { this.Recenter.components.recenter.around(this.el); return 'more' })
    }
    this.recentering = true;
    return true;
  },
  keyup_Recenter() {
    if (this.recentering) {
      console.log('End Recentering')
      this.recenterProcess.stop();
      this.el.sceneEl.emit('endrecenter', undefined, false);
      this.el.sceneEl.systems.keyboard.removeListeners(this, MotionKeys);
    }
    this.recentering = false;
    return true;
  },
  keydown_yup() {
    console.log('yup');
  },
  keydown_ydown() {
    console.log('ydown');
  },
  keydown_xleft() {
    console.log('xleft');
  },
  keydown_xright() {
    console.log('xright');
  },
  keydown_zin() {
    console.log('zin');
  },
  keydown_zout() {
    console.log('zout');
  },

});

function setRaycaster(hlc, rayClass, interval = 125, cacheTimeout = 0) {
  const o = requestObject();
  o.rayClass = rayClass; o.rayInterval = interval; o.triggerCacheTimeout = cacheTimeout;
  hlc.el.setAttribute(hlc.attrName, o);
  returnObject(o);
}

function applyOtherTriggers(hlc, oldTriggers, newTriggers) {
  if (oldTriggers)
    oldTriggers.forEach(id => { removeValue(hlc.triggers, id); delete hlc[`keydown_${id}`] });
  newTriggers.forEach(id => { hlc.triggers.push(id); hlc[`keydown_${id}`] = function () { triggerDown(hlc, id); return true } });
}

function targetSelected(hlc, evt) {
  const el = evt.detail.intersectedEl;
  if (isVisibleInScene(el)) {
    hlc.targetEl = el;
    hlc.el.setAttribute('material', 'color', 'green');
    tryTriggerCache(hlc);
  }
}

function targetDeselected(hlc) {
  if (hlc.targetEl) {
    tryTriggerCache(hlc);
    hlc.targetEl = undefined;
  }
  hlc.el.setAttribute('material', 'color', 'red');
}

function tryTriggerCache(hlc) {
  if (!hlc.triggerCache)
    return;
  emitTriggerDown(hlc, hlc.targetEl, hlc.triggerCache);
  hlc.triggerCache = undefined;
  hlc.triggerCacheTimeout.stop();
}

function triggerDown(hlc, key) {
  if (hlc.triggerEl)
    return;
  if (hlc.targetEl) {
    emitTriggerDown(hlc, hlc.targetEl, key);
  } else if (hlc.data.triggerCacheTimeout > 0) {
    if (!hlc.triggerCache)
      hlc.triggerCacheTimeout.start();
    hlc.triggerCache = key;
  }
}

function emitTriggerDown(hlc, el, key) {
  const o = requestObject();
  o.triggerEl = el; o.key = key;
  (hlc.triggerEl = el).emit('triggerDown', o, false);
  returnObject(o);
  hlc.triggerTimer.start();
}

method(triggerUp);
function triggerUp() {
  if (this.triggerEl)
    this.triggerEl.emit('triggerUp', undefined, false);
  this.triggerEl = undefined;
}

method(fTriggerCacheTimeout);
function * fTriggerCacheTimeout() {
  yield ticker.msWaiter(this.data.triggerCacheTimeout);
  this.triggerCache = undefined;
}

function headlessReady(hlc) {
  if (aframe.utils.device.checkHeadsetConnected()) {
    hlc.flHMDDetected = true;
    console.info(`system:headless-controller:headlessReady: HMD device detected. Headless controller ready`);
    return;
  }
  console.info(`system:headless-controller:headlessReady: No HMD device. Headless controller ready`);
}
