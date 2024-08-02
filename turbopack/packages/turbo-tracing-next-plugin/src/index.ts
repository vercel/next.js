import {
  NodeModuleTracePlugin,
  NodeModuleTracePluginOptions,
} from "@vercel/webpack-nft";
import type { NextConfig } from "next";

export function createNodeFileTrace(options?: NodeModuleTracePluginOptions) {
  return function withNodeFileTrace(config: NextConfig = {}) {
    const createWebpackConfig = config.webpack;
    config.outputFileTracing = false;
    config.webpack = (webpackConfig, context) => {
      const config =
        createWebpackConfig?.(webpackConfig, context) ?? webpackConfig;
      if (context.isServer && !context.dev) {
        const plugin = new NodeModuleTracePlugin(options);
        if (config.plugins) {
          config.plugins.push(plugin);
        } else {
          config.plugins = [plugin];
        }
      }

      return config;
    };
    return config;
  };
}
