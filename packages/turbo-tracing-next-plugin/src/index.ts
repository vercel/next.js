import {
  NodeModuleTracePlugin,
  NodeModuleTracePluginOptions,
} from '@vercel/webpack-node-module-trace'
import type { NextConfig } from 'next'

export function turboTracing(options?: NodeModuleTracePluginOptions) {
  return function createTurboTracingConfig(config: NextConfig = {}) {
    const createWebpackConfig = config.webpack
    config.outputFileTracing = false
    config.webpack = (webpackConfig, context) => {
      const config =
        createWebpackConfig?.(webpackConfig, context) ?? webpackConfig
      if (context.isServer && !context.dev) {
        const plugin = new NodeModuleTracePlugin(options)
        if (config.plugins) {
          config.plugins.push(plugin)
        } else {
          config.plugins = [plugin]
        }
      }

      return config
    }
    return config
  }
}
