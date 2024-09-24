// eslint-disable-next-line @typescript-eslint/no-var-requires
const plugins = require("scripts/temp/config-plugins");

/**
 * JSS configuration object
 */
export interface JssConfig extends Record<string, string | undefined> {
  sitecoreApiKey?: string;
  sitecoreApiHost?: string;
  jssAppName?: string;
  graphQLEndpointPath?: string;
  defaultLanguage?: string;
  graphQLEndpoint?: string;
}

export interface ConfigPlugin {
  /**
   * Detect order when the plugin should be called, e.g. 0 - will be called first (can be a plugin which data is required for other plugins)
   */
  order: number;
  /**
   * A function which will be called during config generation
   * @param {JssConfig} config Current (accumulated) config
   */
  exec(config: JssConfig): Promise<JssConfig>;
}

export class JssConfigFactory {
  public async create(defaultConfig: JssConfig = {}): Promise<JssConfig> {
    return (Object.values(plugins) as ConfigPlugin[])
      .sort((p1, p2) => p1.order - p2.order)
      .reduce(
        (promise, plugin) => promise.then((config) => plugin.exec(config)),
        Promise.resolve(defaultConfig),
      );
  }
}

export const jssConfigFactory = new JssConfigFactory();
