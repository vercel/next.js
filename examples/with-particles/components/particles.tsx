import type { Container, Engine, ISourceOptions } from "tsparticles-engine";
import Particles from "react-tsparticles";

const ParticlesComponent = () => {
  const particlesInit = async (engine: Engine) => {
    // here engine can be used for loading additional presets or plugins
    // PRESETS
    // https://github.com/matteobruni/tsparticles/tree/main/presets all official tsParticles presets
    // for example
    // await loadBigCirclesPreset(engine); // it requires "tsparticles-preset-big-circles" dependency
    // PLUGINS
    // https://github.com/matteobruni/tsparticles/tree/main/plugins all official tsParticles plugins
    // for example
    // await loadInfectionPlugin(engine); // it requires "tsparticles-plugin-infection" dependency
    // SHAPES
    // https://github.com/matteobruni/tsparticles/tree/main/shapes all official tsParticles additional shapes
    // for example
    // await loadHeartShape(engine); // it requires "tsparticles-shape-heart" dependency
    // INTERACTIONS
    // https://github.com/matteobruni/tsparticles/tree/main/interactions all offciail tsParticles additional interactions
    // for example
    // await loadLightInteraction(engine); // it requires "tsparticles-interaction-light" dependency
    // UPDATERS
    // https://github.com/matteobruni/tsparticles/tree/main/updaters all official tsParticles additional updaters
    // for example
    // await loadOrbitUpdater(engine); // it requires "tsparticles-updater-orbit" dependency
  };

  const particlesLoaded = async (container: Container) => {
    // the container is the current particles instance, it has methods like refresh(), start(), stop(), play(), pause()
    // the documentation can be found here: https://particles.js.org/docs/modules/Core_Container.html
  };

  // options variable is the particles configuration
  // many configurations can be found here: https://particles.js.org
  // other configurations can be found in the official CodePen collection here: https://codepen.io/collection/DPOage
  const options: ISourceOptions = {
    fullScreen: {
      enable: true, // set this to false to use the particles like any other DOM element, with this true they act like a background
      zIndex: -1,
    },
    fpsLimit: 120,
    particles: {
      number: {
        value: 80,
        density: {
          enable: true,
          area: 800,
        },
      },
      color: {
        value: ["#2EB67D", "#ECB22E", "#E01E5B", "#36C5F0"],
      },
      shape: {
        type: "circle",
      },
      opacity: {
        value: 1,
      },
      size: {
        value: { min: 1, max: 8 },
      },
      links: {
        enable: true,
        distance: 150,
        color: "#808080",
        opacity: 0.4,
        width: 1,
      },
      move: {
        enable: true,
        speed: 5,
        outModes: {
          default: "out",
        },
      },
    },
    interactivity: {
      events: {
        onHover: {
          enable: true,
          mode: "grab",
        },
        onClick: {
          enable: true,
          mode: "push",
        },
      },
      modes: {
        grab: {
          distance: 280,
          links: {
            opacity: 1,
            color: "#808080",
          },
        },
        push: {
          quantity: 4,
        },
      },
    },
  };

  return (
    <Particles
      id="particles"
      init={particlesInit}
      loaded={particlesLoaded}
      options={options}
    />
  );
};

export default ParticlesComponent;
