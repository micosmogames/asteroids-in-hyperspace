/* global THREE */

import aframe from 'aframe';
import * as ticker from '@micosmo/ticker/aframe-ticker';
import { onLoadedDo } from '@micosmo/aframe/startup';
import { bindEvent } from 'aframe-event-decorators/event-binder';
import { isVisibleInScene } from '@micosmo/aframe/lib/utils';
import { declareMethods, method, requestObject, returnObject, removeValue } from '@micosmo/core';

declareMethods(triggerUp, fTriggerCacheTimeout);

const RecenterKeys = ['rup', 'rdown', 'rleft', 'rright', 'rin', 'rout', 'rrotleft', 'rrotright'];

aframe.registerComponent("headless-controller", {
  schema: {
    rayClass: { type: 'string', default: '.cursor-none' },
    rayInterval: { type: 'int', default: 0 },
    triggerCacheTimeout: { type: 'number', default: 0.0 },
    triggers: { type: 'array', default: [] },
    triggerEventTarget: { type: "selector" }, // Target will need to filter the events
    recenterMove: { default: 2.00 }, // m/s
    recenterRotate: { default: 180 } // In degrees / s
  },
  dependencies: ['cursor', 'raycaster', 'geometry', 'material'],
  init() {
    if (this.el.sceneEl.querySelectorAll('[headless-controller]').length > 1)
      throw new Error(`micosmo:component:headless-controller:init: Only one headless-controller permitted`);

    this.sysKB = this.el.sceneEl.systems.keyboard;
    this.Cursor = this.el;
    this.Camera = this.el.sceneEl.querySelector('[camera]');
    this.Recenter = this.el.sceneEl.querySelector('[recenter]');
    if (this.Recenter) {
      this.el.sceneEl.systems.keyboard.addListeners(this, 'Recenter');
      this.recenterProcess = ticker.createProcess(this.recentering.bind(this));
    }

    this.flHMDDetected = undefined; // Require 3 checkable states.
    this.targetEl = this.triggerEl = this.triggerCache = undefined;
    this.saveRecenterPosition = new THREE.Vector3();
    this.vRecenter = new THREE.Vector4(0, 0, 0, 0);
    this.yAxis = new THREE.Vector3(0, 1, 0);
    this.quat = new THREE.Quaternion();
    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();

    this.triggers = ['Trigger'];
    this.el.sceneEl.systems.keyboard.addListeners(this, this.triggers);
    onLoadedDo(() => { headlessReady(this) });
    this.triggerTimer = ticker.createProcess(ticker.msWaiter(100, method(triggerUp).bind(this)));
    this.triggerCacheTimeout = ticker.createProcess(method(fTriggerCacheTimeout).bind(this));
  },
  update(oldData) {
    if (oldData.rayClass !== this.data.rayClass) {
      this.Cursor.setAttribute('raycaster', { objects: this.data.rayClass, interval: this.data.rayInterval });
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
  toggleCursor(state) {
    if (this.Cursor.components.raycaster.data.enabled) {
      if (state !== true) {
        this.Cursor.object3D.visible = false;
        this.saveCursorRecenterPosition.copy(this.Recenter.object3D.position);
        this.Recenter.object3D.position.copy(this.saveRecenterPosition);
        this.Cursor.setAttribute('raycaster', 'enabled', 'false');
        this.Cursor.setAttribute('paused', 'true');
      }
    } else if (state !== false) {
      this.Cursor.object3D.visible = true;
      this.saveRecenterPosition.copy(this.Recenter.object3D.position);
      if (this.saveCursorRecenterPosition)
        this.Recenter.object3D.position.copy(this.saveCursorRecenterPosition);
      else
        this.saveCursorRecenterPosition = new THREE.Vector3();
      this.Cursor.setAttribute('raycaster', 'enabled', 'true');
      this.Cursor.setAttribute('paused', 'false');
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
    if (!this.flRecentering) {
      this.sysKB.addListeners(this, RecenterKeys);
      this.el.sceneEl.emit('startrecenter', undefined, false);
      this.recenterProcess.start();
    }
    this.flRecentering = true;
    return true;
  },
  keyup_Recenter() {
    if (this.flRecentering) {
      this.recenterProcess.stop();
      this.el.sceneEl.emit('endrecenter', undefined, false);
      this.sysKB.removeListeners(this, RecenterKeys);
    }
    this.flRecentering = false;
    return true;
  },
  keydown_rup() { this.vRecenter.set(0, -1, 0, 0) },
  keydown_rdown() { this.vRecenter.set(0, 1, 0, 0) },
  keydown_rleft() { this.vRecenter.set(1, 0, 0, 0) },
  keydown_rright() { this.vRecenter.set(-1, 0, 0, 0) },
  keydown_rin() { this.vRecenter.set(0, 0, 1, 0) },
  keydown_rout() { this.vRecenter.set(0, 0, -1, 0) },
  keydown_rrotleft() { this.vRecenter.set(0, 0, 0, -1) },
  keydown_rrotright() { this.vRecenter.set(0, 0, 0, 1) },
  recentering(tm, dt) {
    const vr = this.vRecenter; const distance = this.data.recenterMove * dt / 1000;
    this.v1.set(vr.x * distance, vr.y * distance, vr.z * distance);
    this.Recenter.object3D.position.add(this.v1);
    if (vr.w !== 0) {
      this.quat.setFromAxisAngle(this.yAxis, THREE.Math.degToRad(this.data.recenterRotate * dt / 1000));
      if (vr.w < 0) this.quat.conjugate();
      this.Recenter.object3D.position.applyQuaternion(this.quat);
      this.Recenter.object3D.applyQuaternion(this.quat);
    }
    vr.set(0, 0, 0, 0);
    return 'more'
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
  hlc.triggerDetail = requestObject();
  hlc.triggerDetail.triggerEl = hlc.triggerEl = el; hlc.triggerDetail.key = key;
  (hlc.data.triggerEventTarget || el).emit('triggerDown', hlc.triggerDetail, false);
  hlc.triggerTimer.start();
}

method(triggerUp);
function triggerUp() {
  if (this.triggerEl)
    (this.data.triggerEventTarget || this.triggerEl).emit('triggerUp', this.triggerDetail, false);
  returnObject(this.triggerDetail);
  this.triggerDetail = this.triggerEl = undefined;
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

// Dummy component to assign to mixins for mapping to the raycaster
aframe.registerComponent("trigger-target", {})
