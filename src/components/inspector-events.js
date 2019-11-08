import aframe from 'aframe';
import { removeValue } from '@micosmo/core/object';
// import { onLoadedDo } from '@micosmo/aframe/startup';

const _ = undefined;
const Scenes = [];

if (aframe.INSPECTOR !== undefined)
  InspectorEvents();
else
  window.addEventListener("inspector-loaded", InspectorEvents);

var InspectorEventsLoaded = false;
function InspectorEvents() {
  if (InspectorEventsLoaded) return;
  InspectorEventsLoaded = true;
  console.log('inspector loaded', aframe.INSPECTOR);
  aframe.INSPECTOR.on("inspectormodechanged", active => {
    emit(_, active ? "inspectorenabled" : "inspectordisabled");
  });
  aframe.INSPECTOR.on("selectedentitycomponentchanged", event => {
    emit(event.target, "inspectorcomponentchanged");
  });
}

function emit(entity, msg, data) {
  console.log('inspector emit', msg);
  const scene = document.querySelector('a-scene');
  if (!scene) return;
  if (!Scenes.includes(scene)) {
    // inspector-events component isn't active in scene, so dont send events.
    return;
  }
  (entity || scene).emit(msg, data, false); // No bubbling
}

aframe.registerComponent("inspector-events", {
  init() {
    const scene = this.el.sceneEl;
    if ((scene.components['inspector-events'] ? 1 : 0) + scene.querySelectorAll(['inspector-events']).length > 1)
      throw new Error('micosmo:component:inspector-events:init: Single instance only');
    Scenes.push(scene);
    /*
    this.observer = new MutationObserver(function (mutations) {
      mutations.forEach(mutation => {
        if (mutation.type === "attributes") {
          console.log("Attribute changed:", mutation.attributeName, mutation.target);
        }
      });
    });
    */
    scene.systems.keyboard.tryAddListeners(this);
    //    this.observer.observe(scene, { attributes: true });
  },
  remove() {
    removeValue(Scenes, this.el.sceneEl);
    this.observer.disconnect();
  },

  keydown() { loadInspectorEvents(); return false }
});

function loadInspectorEvents() {
  setTimeout(() => {
    if (!aframe.INSPECTOR) {
      loadInspectorEvents();
      return;
    }
    if (InspectorEventsLoaded) return;
    InspectorEvents();
    emit(_, "inspectorenabled");
  }, 50);
}
