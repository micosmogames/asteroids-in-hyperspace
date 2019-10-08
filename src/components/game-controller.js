// /* global THREE */
import aframe from "aframe";
import { bindEvent } from "aframe-event-decorators";

aframe.registerComponent("game-controller", {
  schema: { default: "left" },

  init: function () {
    var self = this;
    var el = this.el;
    // Active buttons populated by events provided by the attached controls.
    this.pressedButtons = {};
    this.touchedButtons = {};

    this.onGripDown = function () {
      self.handleButton("grip", "down");
    };
    this.onGripUp = function () {
      self.handleButton("grip", "up");
    };
    this.onTrackpadDown = function () {
      self.handleButton("trackpad", "down");
    };
    this.onTrackpadUp = function () {
      self.handleButton("trackpad", "up");
    };
    this.onTrackpadTouchStart = function () {
      self.handleButton("trackpad", "touchstart");
    };
    this.onTrackpadTouchEnd = function () {
      self.handleButton("trackpad", "touchend");
    };
    this.onTriggerDown = function () {
      self.handleButton("trigger", "down");
    };
    this.onTriggerUp = function () {
      self.handleButton("trigger", "up");
    };
    this.onTriggerTouchStart = function () {
      self.handleButton("trigger", "touchstart");
    };
    this.onTriggerTouchEnd = function () {
      self.handleButton("trigger", "touchend");
    };
    this.onGripTouchStart = function () {
      self.handleButton("grip", "touchstart");
    };
    this.onGripTouchEnd = function () {
      self.handleButton("grip", "touchend");
    };
    this.onThumbstickDown = function () {
      self.handleButton("pause", "down");
    };
    this.onThumbstickUp = function () {
      self.handleButton("pause", "up");
    };
    this.onMenuDown = function () {
      self.handleButton("pause", "down");
    };
    this.onMenuUp = function () {
      self.handleButton("pause", "up");
    };
    this.onAorXTouchStart = function () {
      self.handleButton("AorX", "touchstart");
    };
    this.onAorXTouchEnd = function () {
      self.handleButton("AorX", "touchend");
    };
    this.onBorYTouchStart = function () {
      self.handleButton("BorY", "touchstart");
    };
    this.onBorYTouchEnd = function () {
      self.handleButton("BorY", "touchend");
    };
    this.onSurfaceTouchStart = function () {
      self.handleButton("surface", "touchstart");
    };
    this.onSurfaceTouchEnd = function () {
      self.handleButton("surface", "touchend");
    };
    this.onAorXDown = function () {
      self.handleButton("AorX", "down");
    };

    // Specialised events to handle special game states
    this.onEndRecentering = function () {
      self.handleEndRecenter("grip", "up");
    };
    this.onEndGamePause = function () {
      self.handleEndGamePause("pause", "down");
    };
    this.onPauseGripDown = function () {
      self.isRecentering = true;
    };
    this.onPauseGripUp = function () {
      self.isRecentering = false;
    };

    this.onControllerConnected = () => {
      console.info(`micosmo:component:game-controller: ${this.data} controller connected`);
      this.el.object3D.visible = true;
      this.controllerPresent = true;
    }

    this.onControllerDisconnected = () => {
      console.info(`micosmo:component:game-controller: ${this.data} controller disconnected`);
      this.el.object3D.visible = false;
      this.controllerPresent = false;
    }

    el.addEventListener("controllerconnected", this.onControllerConnected);
    el.addEventListener("controllerdisconnected", this.onControllerDisconnected);

    this.player = document.querySelector("#player");
    // Save all the registered game controllers in the player.
    if (!this.player.game_controllers)
      this.player.game_controllers = [this];
    else
      this.player.game_controllers.push(this);
    // Get the element that owns the 'game-state' property.
    this.gameState = document.querySelector("[game-state]");
    // Grab the game pause element to display if explicit pause requested.
    this.gamePaused = document.querySelector('#gamePaused');

    this.isRecentering = false;
    this.ready = false;
  },

  play: function () {
    this.addEventListeners();
  },

  pause: function () {
    this.removeEventListeners();
  },

  startCentering: function () {
    /*
    this.pauseControllers(this.onEndRecentering, "gripup");
    this.gamePausedEl.emit('startPause', {
      displayPause: false,
      endCallback: () => {
        this.isRecentering = false;
        this.playControllers(this.onEndRecentering, "gripup");
      }
    });
    */
    this.isRecentering = true;
  },

  endCentering: function () {
    this.isRecentering = false;
    /*
    this.gamePausedEl.emit('endPause', { displayPause: false });
    this.playControllers(this.onEndRecentering, "gripup");
    */
  },

  startGamePause: function () {
    this.pauseControllers(this.onEndGamePause, "thumbstickdown", "menudown");
    this.el.addEventListener("gripdown", this.onPauseGripDown);
    this.el.addEventListener("gripup", this.onPauseGripUp);
    this.gamePausedEl.emit('startPause', {
      displayPause: true,
      endCallback: () => {
        this.el.removeEventListener("gripdown", this.onPauseGripDown);
        this.el.removeEventListener("gripup", this.onPauseGripUp);
        this.playControllers(this.onEndGamePause, "thumbstickdown", "menudown");
      }
    });
  },

  endGamePause: function () {
    this.gamePausedEl.emit('endPause', { displayPause: true });
    this.el.removeEventListener("gripdown", this.onPauseGripDown);
    this.el.removeEventListener("gripup", this.onPauseGripUp);
    this.playControllers(this.onEndGamePause, "thumbstickdown", "menudown");
  },

  pauseControllers(endFn, endEvt1, endEvt2) {
    this.playerEl.game_controllers.forEach(gc => {
      gc.removeEventListeners();
      gc.el.addEventListener(endEvt1, endFn);
      if (endEvt2)
        gc.el.addEventListener(endEvt2, endFn);
    });
  },

  playControllers(endFn, endEvt1, endEvt2) {
    this.playerEl.game_controllers.forEach(gc => {
      gc.el.removeEventListener(endEvt1, endFn);
      if (endEvt2)
        gc.el.removeEventListener(endEvt2, endFn);
      gc.addEventListeners();
    });
  },

  tick: function (time, delta) {
    if (this.isRecentering) {
      this.playerEl.components.recenter.around(this.el);
    }
    /*
    const isOculus = this.el.components["oculus-touch-controls"]
      .controllerPresent;
    if (!this.oculusInstructionsSet && isOculus) {
      document
        .querySelector("#launchOmegaInstructions")
        .setAttribute(
          "text__omega",
          "value",
          "A      OR      X      BUTTONS      TO      LAUNCH      OMEGA      MISSILE"
        );
      this.oculusInstructionsSet = true;
    }
    */
    /*
        var mesh = this.el.getObject3D("mesh");

        if (!mesh || !mesh.mixer) {
          return;
        }

        mesh.mixer.update(delta / 1000);
    */
  },
  /*
  gamestatechanged: bindEvent({ target: "[game-state]" }, function (evt) {
    const newState = evt.detail;
    if (newState === 'Loading') {
      this.ready = true;
    }
  }),
  */
  addEventListeners: function () {
    var el = this.el;
    el.addEventListener("gripdown", this.onGripDown);
    el.addEventListener("gripup", this.onGripUp);
    el.addEventListener("trackpaddown", this.onTrackpadDown);
    el.addEventListener("trackpadup", this.onTrackpadUp);
    el.addEventListener("trackpadtouchstart", this.onTrackpadTouchStart);
    el.addEventListener("trackpadtouchend", this.onTrackpadTouchEnd);
    el.addEventListener("triggerdown", this.onTriggerDown);
    el.addEventListener("triggerup", this.onTriggerUp);
    el.addEventListener("triggertouchstart", this.onTriggerTouchStart);
    el.addEventListener("triggertouchend", this.onTriggerTouchEnd);
    el.addEventListener("griptouchstart", this.onGripTouchStart);
    el.addEventListener("griptouchend", this.onGripTouchEnd);
    el.addEventListener("thumbstickdown", this.onThumbstickDown);
    el.addEventListener("thumbstickup", this.onThumbstickUp);
    el.addEventListener("menudown", this.onMenuDown);
    el.addEventListener("menuup", this.onMenuUp);
    el.addEventListener("abuttontouchstart", this.onAorXTouchStart);
    el.addEventListener("abuttontouchend", this.onAorXTouchEnd);
    el.addEventListener("bbuttontouchstart", this.onBorYTouchStart);
    el.addEventListener("bbuttontouchend", this.onBorYTouchEnd);
    el.addEventListener("xbuttontouchstart", this.onAorXTouchStart);
    el.addEventListener("xbuttontouchend", this.onAorXTouchEnd);
    el.addEventListener("ybuttontouchstart", this.onBorYTouchStart);
    el.addEventListener("ybuttontouchend", this.onBorYTouchEnd);
    el.addEventListener("surfacetouchstart", this.onSurfaceTouchStart);
    el.addEventListener("surfacetouchend", this.onSurfaceTouchEnd);
    el.addEventListener("xbuttondown", this.onAorXDown);
    el.addEventListener("abuttondown", this.onAorXDown);
  },

  removeEventListeners: function () {
    var el = this.el;
    el.removeEventListener("gripdown", this.onGripDown);
    el.removeEventListener("gripup", this.onGripUp);
    el.removeEventListener("trackpaddown", this.onTrackpadDown);
    el.removeEventListener("trackpadup", this.onTrackpadUp);
    el.removeEventListener("trackpadtouchstart", this.onTrackpadTouchStart);
    el.removeEventListener("trackpadtouchend", this.onTrackpadTouchEnd);
    el.removeEventListener("triggerdown", this.onTriggerDown);
    el.removeEventListener("triggerup", this.onTriggerUp);
    el.removeEventListener("triggertouchstart", this.onTriggerTouchStart);
    el.removeEventListener("triggertouchend", this.onTriggerTouchEnd);
    el.removeEventListener("griptouchstart", this.onGripTouchStart);
    el.removeEventListener("griptouchend", this.onGripTouchEnd);
    el.removeEventListener("thumbstickdown", this.onThumbstickDown);
    el.removeEventListener("thumbstickup", this.onThumbstickUp);
    el.removeEventListener("menudown", this.onMenuDown);
    el.removeEventListener("menuup", this.onMenuUp);
    el.removeEventListener("abuttontouchstart", this.onAorXTouchStart);
    el.removeEventListener("abuttontouchend", this.onAorXTouchEnd);
    el.removeEventListener("bbuttontouchstart", this.onBorYTouchStart);
    el.removeEventListener("bbuttontouchend", this.onBorYTouchEnd);
    el.removeEventListener("xbuttontouchstart", this.onAorXTouchStart);
    el.removeEventListener("xbuttontouchend", this.onAorXTouchEnd);
    el.removeEventListener("ybuttontouchstart", this.onBorYTouchStart);
    el.removeEventListener("ybuttontouchend", this.onBorYTouchEnd);
    el.removeEventListener("surfacetouchstart", this.onSurfaceTouchStart);
    el.removeEventListener("surfacetouchend", this.onSurfaceTouchEnd);
    el.removeEventListener("xbuttondown", this.onAorXDown);
    el.removeEventListener("abuttondown", this.onAorXDown);
  },

  /**
   * Update handler. More like the `init` handler since the only property is the hand, and
   * that won't be changing much.
   */
  update: function (previousHand) {
    // Get common configuration to abstract different vendor controls.
    const el = this.el;
    const controlConfiguration = { hand: this.hand, model: true };

    el.setAttribute("vive-controls", controlConfiguration);
    el.setAttribute("oculus-touch-controls", controlConfiguration);
    el.setAttribute("windows-motion-controls", controlConfiguration);
  },

  /**
   *
   * @param {string} button - Name of the button.
   * @param {string} evt - Type of event for the button (i.e., down/up/touchstart/touchend).
   */
  handleButton: function (button, evt) {
    if (!this.ready) return;
    /*
    const isAdvancedControls = this.gameStateEl.components["game-state"].isAdvancedControls();
    if (button.indexOf("trigger") === 0 && evt.indexOf("down") === 0) {
      this.el.components["launch-controls"].launch(isAdvancedControls);
    } else if (
      (button.indexOf("trackpad") === 0 || button.indexOf("AorX") === 0) &&
      evt.indexOf("down") === 0 &&
      isAdvancedControls
    ) {
      this.el.components["launch-controls"].launchOmega();
    */
    if (button.indexOf("grip") === 0 && evt.indexOf("down") === 0) {
      // Have a problem with the Oculus Rift sending 'down' events before
      // 'touchstart' events. Results in the 'isRecentering' flag being
      // cleared straight after we set it.
      // Changed to explicitly handle 'down' and 'up' events only
      // Recentering handled by separate event handler
      this.startCentering();
    }
    /*
    } else if (button.indexOf("pause") === 0 && evt.indexOf("down") === 0) {
      // Game pause handled by separate event handler
      // Use thumbstick on Oculus Touch and menu button on Vive
      this.startGamePause();
    }
    */
  },

  handleEndRecenter: function (button, evt) {
    if (button.indexOf("grip") === 0 && evt.indexOf("up") === 0) {
      // Only accept gripup events. Ignore anything else which shouldn't happen.
      this.endCentering();
    }
  },

  handleEndGamePause: function (button, evt) {
    if (button.indexOf("pause") === 0 && evt.indexOf("down") === 0) {
      // Only accept thumbstickdown or systemdown events.
      // Ignore anything else which shouldn't happen.

      //      this.endGamePause();
    }
  }
});

/*
function isViveController(trackedControls) {
  var controllerId =
    trackedControls &&
    trackedControls.controller &&
    trackedControls.controller.id;
  return controllerId && controllerId.indexOf("OpenVR ") === 0;
}
*/
