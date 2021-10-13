import curry from 'next/dist/compiled/lodash.curry'
import { webpack } from 'next/dist/compiled/webpack/webpack'
import { loader } from '../../helpers'
import { ConfigurationContext, ConfigurationFn, pipe } from '../../utils'
import { getCustomDocumentImageError } from './messages'

export const images = curry(async function images(
  _ctx: ConfigurationContext,
  config: webpack.Configuration
) {
  const fns: ConfigurationFn[] = [
    loader({
      oneOf: [
        {
          test: /\.(png|jpg|jpeg|gif|webp|avif|ico|bmp|svg)$/i,
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
