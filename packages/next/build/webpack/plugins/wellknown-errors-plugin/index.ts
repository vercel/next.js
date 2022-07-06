import type { webpack5 as webpack } from 'next/dist/compiled/webpack/webpack'
import type { NextConfig } from '../../../../server/config-shared'

import { getModuleBuildError } from './webpackModuleError'

export class WellKnownErrorsPlugin {
  config: NextConfig

  constructor({ config }: { config: NextConfig }) {
    this.config = config
  }

  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap('WellKnownErrorsPlugin', (compilation) => {
      compilation.hooks.afterSeal.tapPromise(
        'WellKnownErrorsPlugin',
        async () => {
          if (compilation.errors?.length) {
            await Promise.all(
              compilation.errors.map(async (err, i) => {
                try {
                  const moduleError = await getModuleBuildError(
                    compilation,
                    err,
                    this.config
                  )
                  if (moduleError !== false) {
                    compilation.errors[i] = moduleError
                  }
                } catch (e) {
                  console.log(e)
                }
              })
            )
          }
        }
      )
    })
  }
}
