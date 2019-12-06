import webpack from 'webpack'
import { base } from './blocks/base'
import { css } from './blocks/css'
import { ConfigurationContext, pipe } from './utils'

export function build(
  config: webpack.Configuration,
  {
    rootDirectory,
    customAppFile,
    isDevelopment,
    isServer,
    hasSupportCss,
  }: {
    rootDirectory: string
    customAppFile: string | null
    isDevelopment: boolean
    isServer: boolean
    hasSupportCss: boolean
  }
) {
  const ctx: ConfigurationContext = {
    rootDirectory,
    customAppFile,
    isDevelopment,
    isProduction: !isDevelopment,
    isServer,
    isClient: !isServer,
  }

  const fn = pipe(base(ctx), css(hasSupportCss, ctx))
  return fn(config)
}

// eslint-disable-next-line no-extend-native
Object.defineProperty(RegExp.prototype, 'toJSON', {
  value: RegExp.prototype.toString,
})
console.log(
  JSON.stringify(
    build(
      {},
      {
        rootDirectory: '/noop',
        customAppFile: '/noop/pages/_app.js',
        isDevelopment: true,
        isServer: false,
        hasSupportCss: true,
      }
    ),
    null,
    2
  )
)
