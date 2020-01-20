import curry from 'lodash.curry'
import { Configuration } from 'webpack'
import { ConfigurationContext } from '../utils'

export const base = curry(function base(
  ctx: ConfigurationContext,
  config: Configuration
) {
  config.mode = ctx.isDevelopment ? 'development' : 'production'
  config.name = ctx.isServer ? 'server' : 'client'
  config.target = ctx.isServer ? 'node' : 'web'

  config.devtool = ctx.isDevelopment
    ? 'cheap-module-source-map'
    : ctx.isProduction
    ? false
    : false

  if (!config.module) {
    config.module = { rules: [] }
  }
  config.module.strictExportPresence = true

  return config
})
