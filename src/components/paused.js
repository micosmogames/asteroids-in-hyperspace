import aframe from 'aframe';
import { Threadlet } from "@micosmo/async/threadlet";

aframe.registerComponent("paused", {
  schema: { default: true },
  init() {
    this.initialised = false;
    this.oldPlay = this.el.play;
  },
  update(oldData) {
    // Ignore the initial update to allow the initial play() call to setup.
    if (oldData === undefined) return;
    if (oldData !== true && this.data === true) this.el.pause();
    else if (oldData === true && this.data !== true) this.oldPlay.call(this.el);
  },
  remove() {
    this.el.play = this.oldPlay;
    if (this.data === true) this.el.play();
  },
  play() {
    if (this.initialised) return;
    // Need to allow the initial play() request to be fully processed to
    // ensure that the aframe 'isPlaying 'flag is created for all components.
    // We wrap the play function now and issue the pause asynchronously.
    this.el.play = () => { if (this.data !== true) this.oldPlay.call(this.el) };
    if (this.data === true) Threadlet.DefaultPriority.run(() => this.el.pause());
    this.initialised = true;
  }
});
