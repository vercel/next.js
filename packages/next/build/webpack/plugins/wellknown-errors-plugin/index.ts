import type webpack5 from 'webpack5'
import { getModuleBuildError } from './webpackModuleError'

export class WellKnownErrorsPlugin {
  apply(compiler: webpack5.Compiler) {
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
                    err
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
