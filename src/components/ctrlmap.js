import aframe from 'aframe';
import { addListeners, removeListeners, ControllerMap } from "./game-controller";

aframe.registerComponent("ctrlmap", {
  schema: { default: '' },
  update(oldData) {
    if (oldData && oldData !== '')
      throw new Error(`micosmo:component:ctrlmap:update: Controller mappings can not be updated`);
    if (this.data === '')
      throw new Error(`micosmo:component:ctrlmap:update: Controller mappings required`);
    this.mappings = prepareMappings(this);
  },
  addListeners(comp, ...ctrlSpecs) {
    if (!comp || !comp.el || comp.el.components.ctrlmap !== this)
      throw new Error('micosmo:component:ctrlmap:addListeners: Ctrlmap is not associated with component');
    addListeners(this, comp, ctrlSpecs);
  },
  removeListeners(comp, ...ids) {
    if (!comp || !comp.el || comp.el.components.ctrlmap !== this)
      throw new Error('micosmo:component:ctrlmap:removeListeners: Ctrlmap is not associated with component');
    removeListeners(this, comp, ids);
  },
  play() { this.isPaused = false },
  pause() { this.isPaused = true }
});

const ParseOptions = { entrySeparator: ',', appendDuplicates: true };

function prepareMappings(cm) {
  const ctrlMap = Object.create(null);
  const idMap = cm.el.sceneEl.systems.dataset.parse(cm.data, undefined, ParseOptions);
  for (var id in idMap) {
    const id1 = id;
    var ctrls = idMap[id];
    if (!ctrls)
      idMap[id] = ctrls = [id]; // Default to ctrl id === ctrl code.
    else if (!Array.isArray(ctrls))
      idMap[id] = ctrls = [ctrls];
    ctrls.forEach(ctrl => {
      if (!ControllerMap[ctrl])
        throw new Error(`micosmo:component:ctrlmap:update: Control '${ctrl}' is not supported.`);
      if (ctrlMap[ctrl])
        throw new Error(`micosmo:component:ctrlmap:update: Multiple ids ('${ctrlMap[ctrl]}' & '${id1}') for control '${ctrl}'.`);
      ctrlMap[ctrl] = id1;
    });
  }
  return { ctrlMap, idMap };
}
