import isWslBoolean from 'next/dist/compiled/is-wsl'
import curry from 'next/dist/compiled/lodash.curry'
import { Configuration } from 'webpack'
import { ConfigurationContext } from '../utils'

const isWindows = process.platform === 'win32' || isWslBoolean

export const base = curry(function base(
  ctx: ConfigurationContext,
  config: Configuration
) {
  config.mode = ctx.isDevelopment ? 'development' : 'production'
  config.name = ctx.isServer ? 'server' : 'client'
  config.target = ctx.isServer ? 'node' : 'web'

  // Stop compilation early in a production build when an error is encountered.
  // This behavior isn't desirable in development due to how the HMR system
  // works, but is a good default for production.
  config.bail = ctx.isProduction

  // https://webpack.js.org/configuration/devtool/#development
  if (ctx.isDevelopment) {
    if (process.env.__NEXT_TEST_MODE && !process.env.__NEXT_TEST_WITH_DEVTOOL) {
      config.devtool = false
    } else if (isWindows) {
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
