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
    recenterMove: { type: 'vec3', default: { x: 0.020, y: 0.020, z: 0.020 } },
    recenterRotate: { default: 5 } // In degrees
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
      onLoadedDo(() => { this.compRecenter = this.Recenter.components.recenter });
      this.recenterProcess = ticker.createProcess(() => { this.compRecenter.around(this.VC); return 'more' })
      // Create a Virtual Controller element at the same level as the camera and at the same position.
      this.VC = document.createElement('a-entity');
      this.VC.setAttribute('id', 'VirtualController');
      this.VC.object3D.visible = false;
      this.Recenter.parentEl.appendChild(this.VC);
      onLoadedDo(() => this.VC.object3D.position.copy(this.Recenter.object3D.position));

      this.qRecPosRotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.Math.degToRad(this.data.recenterRotate));
      this.qRecNegRotation = this.qRecPosRotation.clone().conjugate();
    }

    this.flHMDDetected = undefined; // Require 3 checkable states.
    this.targetEl = this.triggerEl = this.triggerCache = undefined;
    this.saveRecenterPosition = new THREE.Vector3();
    this.vRecenter = new THREE.Vector3();
    this.v1 = new THREE.Vector3();
    this.v2 = new THREE.Vector3();

    this.triggers = ['Trigger'];
    this.el.sceneEl.systems.keyboard.addListeners(this, this.triggers);
    onLoadedDo(() => { headlessReady(this) });
    this.triggerTimer = ticker.createProcess(ticker.msWaiter(100, method(triggerUp).bind(this)));
    this.triggerCacheTimeout = ticker.createProcess(method(fTriggerCacheTimeout).bind(this));

    console.log(this.el);
    var object3D = this.Recenter.object3D;
    console.log('Recenter', object3D.getWorldPosition(this.v1), object3D.getWorldDirection(this.v2));
    object3D = new THREE.Object3D();
    console.log('new object', object3D.getWorldPosition(this.v1), object3D.getWorldDirection(this.v2));
    object3D = this.VC.object3D;
    console.log('VC', object3D.getWorldPosition(this.v1), object3D.getWorldDirection(this.v2).multiplyScalar(3));
    this.v1.sub(this.v2); console.log('VC sub Origin', this.v1);
    this.v1.applyQuaternion(this.qRecPosRotation); console.log('VC Rotate', this.v1);
    this.v1.add(this.v2); console.log('VC add Origin', this.v1);
    this.v1.sub(this.v2); console.log('VC sub Origin', this.v1);
    this.v1.applyQuaternion(this.qRecPosRotation); console.log('VC Rotate', this.v1);
    this.v1.add(this.v2); console.log('VC add Origin', this.v1);

    const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), THREE.Math.degToRad(5));
    const q1 = q.clone().inverse();
    const v = new THREE.Vector3(1, 1, 1); const v1 = (new THREE.Vector3()).copy(v);
    console.log(v, q, v1, q1);
    v.applyQuaternion(q); v1.applyQuaternion(q1); console.log(v, v1);
    v.applyQuaternion(q); v1.applyQuaternion(q1); console.log(v, v1);
    v.applyQuaternion(q); v1.applyQuaternion(q1); console.log(v, v1);
    v.applyQuaternion(q); v1.applyQuaternion(q1); console.log(v, v1);
    //    const o = new THREE.Object3D();
    //    o.position.set(1, 1, 1);
    //    console.log(o.position, o.rotation, o.scale);
    //    o.applyQuaternion(q);
    //    console.log(o.position, o.rotation, o.scale);
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
  toggleCursor() {
    if (this.Cursor.components.raycaster.data.enabled) {
      this.Cursor.object3D.visible = false;
      this.Recenter.object3D.position.copy(this.saveRecenterPosition);
      this.Cursor.setAttribute('raycaster', 'enabled', 'false');
      this.Cursor.setAttribute('paused', 'true');
    } else {
      this.Cursor.object3D.visible = true;
      this.saveRecenterPosition.copy(this.Recenter.object3D.position);
      this.Recenter.components.recenter.around(this.VC);
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
    if (!this.recentering) {
      this.compRecenter.start('keyboard');
      this.sysKB.addListeners(this, RecenterKeys);
      this.el.sceneEl.emit('startrecenter', undefined, false);
      this.recenterProcess.start();
    }
    this.recentering = true;
    return true;
  },
  keyup_Recenter() {
    if (this.recentering) {
      this.recenterProcess.stop();
      this.el.sceneEl.emit('endrecenter', undefined, false);
      this.sysKB.removeListeners(this, RecenterKeys);
      this.compRecenter.stop();
    }
    this.recentering = false;
    return true;
  },
  keydown_rup() { this.VC.object3D.position.add(this.vRecenter.set(0, this.data.recenterMove.y, 0)) },
  keydown_rdown() { this.VC.object3D.position.add(this.vRecenter.set(0, this.data.recenterMove.y, 0).negate()) },
  keydown_rleft() { this.VC.object3D.position.add(this.vRecenter.set(this.data.recenterMove.x, 0, 0).negate()) },
  keydown_rright() { this.VC.object3D.position.add(this.vRecenter.set(this.data.recenterMove.x, 0, 0)) },
  keydown_rin() { this.VC.object3D.position.add(this.vRecenter.set(0, 0, this.data.recenterMove.z).negate()) },
  keydown_rout() { this.VC.object3D.position.add(this.vRecenter.set(0, 0, this.data.recenterMove.x)) },
  keydown_rrotleft() {
    this.VC.object3D.position.applyQuaternion(this.qRecPosRotation);
    this.VC.object3D.applyQuaternion(this.qRecPosRotation);
  },
  keydown_rrotright() {
    this.VC.object3D.position.applyQuaternion(this.qRecNegRotation);
    this.VC.object3D.applyQuaternion(this.qRecNegRotation);
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
