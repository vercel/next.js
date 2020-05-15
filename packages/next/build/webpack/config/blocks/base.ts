import curry from 'next/dist/compiled/lodash.curry'
import { Configuration } from 'webpack'
import { ConfigurationContext } from '../utils'

export const base = curry(function base(
  ctx: ConfigurationContext,
  config: Configuration
) {
  config.mode = ctx.isDevelopment ? 'development' : 'production'
  config.name = ctx.isServer ? 'server' : 'client'
  config.target = ctx.isServer ? 'node' : 'web'

  // https://webpack.js.org/configuration/devtool/#development
  if (ctx.isDevelopment) {
    if (ctx.isReactRefreshEnabled) {
      if (ctx.isServer || process.platform === 'win32') {
        // Non-eval based source maps are slow to rebuild, so we only enable
        // them for the server and Windows. Unfortunately, eval source maps
        // are not supported by Node.js, and are slow on Windows.
        config.devtool = 'inline-source-map'
      } else {
        // `eval-source-map` provides full-fidelity source maps for the
        // original source, including columns and original variable names.
        // This is desirable so the in-browser debugger can correctly pause
        // and show scoped variables with their original names.
        config.devtool = 'eval-source-map'
      }
    } else {
      // `cheap-module-source-map` is the old preferred format that was
      // required for `react-error-overlay`.
      config.devtool = 'cheap-module-source-map'
    }
  } else {
    config.devtool = false
  }

  if (!config.module) {
    config.module = { rules: [] }
  }
  config.module.strictExportPresence = true

  return config
})
