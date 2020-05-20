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
    if (process.platform === 'win32') {
      // Non-eval based source maps are slow to rebuild, so we only enable
      // them for Windows. Unfortunately, eval source maps are flagged as
      // suspicious by Windows Defender and block HMR.
      config.devtool = 'inline-source-map'
    } else {
      // `eval-source-map` provides full-fidelity source maps for the
      // original source, including columns and original variable names.
      // This is desirable so the in-browser debugger can correctly pause
      // and show scoped variables with their original names.
      config.devtool = 'eval-source-map'
    }
  } else {
    // Enable browser sourcemaps
    if (ctx.productionBrowserSourceMaps) {
      config.devtool = 'source-map'
    } else {
      config.devtool = false
    }
  }

  if (!config.module) {
    config.module = { rules: [] }
  }
  config.module.strictExportPresence = true

  return config
})
