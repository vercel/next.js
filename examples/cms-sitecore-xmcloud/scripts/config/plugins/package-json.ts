import { ConfigPlugin, JssConfig } from "..";
import packageConfig from "package.json";

/**
 * This plugin will set config props based on package.json.
 */
class PackageJsonPlugin implements ConfigPlugin {
  order = 1;

  async exec(config: JssConfig) {
    if (!packageConfig.config) return config;

    return Object.assign({}, config, {
      jssAppName: config.jssAppName || packageConfig.config.appName,
      graphQLEndpointPath:
        config.graphQLEndpointPath || packageConfig.config.graphQLEndpointPath,
      defaultLanguage: config.defaultLanguage || packageConfig.config.language,
    });
  }
}

export const packageJsonPlugin = new PackageJsonPlugin();
