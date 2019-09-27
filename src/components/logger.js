import aframe from "aframe";
import { bindEvent } from "aframe-event-decorators";

aframe.registerComponent("logger", {
  schema: { type: 'string' },
  init: function () {
    if (this.el.hasLoaded)
      this.displayMessage();
  },
  update: function (oldData) { },
  loaded: bindEvent(function () {
    this.displayMessage();
  }),
  displayMessage() {
    console.log(this.data);
  }
});
