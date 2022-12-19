import postcss from "@vercel/turbopack/postcss";
import importedConfig from "CONFIG";

const transform = async (cssContent, name) => {
  let config = importedConfig;
  if (typeof config === "function") {
    config = await config({ env: "development" });
  }
  let plugins = config.plugins;
  if (Array.isArray(plugins)) {
    plugins = plugins.map((plugin) => {
      if (Array.isArray(plugin)) {
        return plugin;
      } else if (typeof plugin === "string") {
        return [plugin, {}];
      } else {
        return plugin;
      }
    });
  } else if (typeof plugins === "object") {
    plugins = Object.entries(plugins).filter(([, options]) => options);
  }
  const loadedPlugins = plugins.map((plugin) => {
    if (Array.isArray(plugin)) {
      const [arg, options] = plugin;
      let pluginFactory = arg;

      if (typeof pluginFactory === "string") {
        pluginFactory = __turbopack_external_require__(pluginFactory);
      }

      if (pluginFactory.default) {
        pluginFactory = pluginFactory.default;
      }

      return pluginFactory(options);
    }
    return plugin;
  });

  const processor = postcss(loadedPlugins);
  const { css, map } = await processor.process(cssContent, {
    from: name,
    to: name,
    map: {
      inline: false,
    },
  });
  return { css, map: JSON.stringify(map) };
};

export { transform as default };
