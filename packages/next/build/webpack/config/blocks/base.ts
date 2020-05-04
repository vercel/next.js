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
    ? ctx.hasReactRefresh
      ? // `eval-source-map` results in the fastest rebuilds during dev. The
        // only drawback is cold boot time, but this is mitigated by the fact
        // that we load entries on-demand.
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
