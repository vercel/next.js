import curry from 'next/dist/compiled/lodash.curry'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import { ConfigurationContext } from '../utils'

export const base = curry(function base(
  ctx: ConfigurationContext,
  config: webpack.Configuration
) {
  config.mode = ctx.isDevelopment ? 'development' : 'production'
  config.name = ctx.isServer
    ? ctx.isEdgeRuntime
      ? 'edge-server'
      : 'server'
    : 'client'

  // @ts-ignore TODO webpack 5 typings
  config.target = !ctx.targetWeb
    ? 'node12.22'
    : ctx.isEdgeRuntime
    ? ['web', 'es6']
    : ['web', 'es5']

  // https://webpack.js.org/configuration/devtool/#development
  if (ctx.isDevelopment) {
    if (process.env.__NEXT_TEST_MODE && !process.env.__NEXT_TEST_WITH_DEVTOOL) {
      config.devtool = false
    } else {
      // `eval-source-map` provides full-fidelity source maps for the
      // original source, including columns and original variable names.
      // This is desirable so the in-browser debugger can correctly pause
      // and show scoped variables with their original names.
      config.devtool = 'eval-source-map'
    }
  } else {
    if (
      ctx.isEdgeRuntime ||
      // Enable browser sourcemaps:
      (ctx.productionBrowserSourceMaps && ctx.isClient)
    ) {
      config.devtool = 'source-map'
    } else {
      config.devtool = false
    }
  }

  if (!config.module) {
    config.module = { rules: [] }
  }

  // TODO: add codemod for "Should not import the named export" with JSON files
  // config.module.strictExportPresence = !isWebpack5

  return config
})
