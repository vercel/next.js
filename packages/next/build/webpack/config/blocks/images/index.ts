import curry from 'next/dist/compiled/lodash.curry'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'
import { nextImageLoaderRegex } from '../../../../webpack-config'
import { loader } from '../../helpers'
import { ConfigurationContext, ConfigurationFn, pipe } from '../../utils'
import { getCustomDocumentImageError } from './messages'

export const images = curry(async function images(
  _ctx: ConfigurationContext,
  config: webpack5.Configuration
) {
  const fns: ConfigurationFn[] = [
    loader({
      oneOf: [
        {
          test: nextImageLoaderRegex,
          use: {
            loader: 'error-loader',
            options: {
              reason: getCustomDocumentImageError(),
            },
          },
          issuer: /pages[\\/]_document\./,
        },
      ],
    }),
  ]

  const fn = pipe(...fns)
  return fn(config)
})
