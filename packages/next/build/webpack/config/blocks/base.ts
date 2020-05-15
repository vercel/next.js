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
  config.devtool = ctx.isDevelopment
    ? ctx.isReactRefreshEnabled
      ? ctx.isServer || process.platform === 'win32'
        ? // Non-eval based source maps are slow to rebuild, so we only enable
          // them for the server and Windows. Unfortunately, eval source maps
          // are not supported by Node.js, and are slow on Windows.
          'inline-source-map'
        : // `eval-source-map` provides full-fidelity source maps for the
          // original source, including columns and original variable names.
          // This is desirable so the in-browser debugger can correctly pause
          // and show scoped variables with their original names.
          'eval-source-map'
      : // `cheap-module-source-map` is the old preferred format that was
        // required for `react-error-overlay`.
        'cheap-module-source-map'
    : ctx.isProduction
    ? false
    : false

  if (!config.module) {
    config.module = { rules: [] }
  }
  config.module.strictExportPresence = true

  return config
})
