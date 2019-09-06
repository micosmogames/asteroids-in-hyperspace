import axios from "axios";
import "aframe";
import "aframe-log-component";
import "aframe-gltf-part-component";
import "aframe-fps-counter-component";
import "@micosmo/aframe/initialise";
// import "./systems/patches"; // Patches must be loaded before any of the components
import "./components/components";
import "./systems/systems";

const loadScene = (path, container) => {
  axios
    .get(path)
    .then(response => {
      const scene = response.data;
      container.innerHTML = scene;
    })
    .catch(error => {
      console.error(`Couldn't load scene: ${path}`, error);
    });
};

// ReactDOM.render(<App />, document.getElementById('root'));
loadScene("./scenes/game-scene.html", document.getElementById("game"));
