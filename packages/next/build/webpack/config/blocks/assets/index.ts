import curry from 'next/dist/compiled/lodash.curry'
import { Configuration } from 'webpack'
import { loader } from '../../helpers'
import { ConfigurationContext, ConfigurationFn, pipe } from '../../utils'
import { getPublicImportError } from './messages'

export const assets = curry(async function assets(
  ctx: ConfigurationContext,
  config: Configuration
) {
  const fns: ConfigurationFn[] = []

  // Throw an error if public assets are directly imported into a file.
  fns.push(
    loader({
      oneOf: [
        {
          test: /public/,
          issuer: {
            include: [ctx.rootDirectory],
          },
          use: {
            loader: 'error-loader',
            options: {
              reason: getPublicImportError(),
            },
          },
        },
      ],
    })
  )

  const fn = pipe(...fns)
  return fn(config)
})
