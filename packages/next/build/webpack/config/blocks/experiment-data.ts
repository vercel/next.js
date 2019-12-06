import curry from 'lodash.curry'
import path from 'path'
import { Configuration } from 'webpack'
import { unshiftLoader } from '../helpers'
import { ConfigurationContext, pipe } from '../utils'

export const experimentData = curry(function experimentData(
  enabled: boolean,
  ctx: ConfigurationContext,
  config: Configuration
) {
  if (!enabled) {
    return config
  }

  if (ctx.isServer) {
    return config
  }

  const fn = pipe(
    unshiftLoader({
      test: /\.(tsx|ts|js|mjs|jsx)$/,
      include: [path.join(ctx.rootDirectory, 'data')],
      use: 'next-data-loader',
    })
  )
  return fn(config)
})
