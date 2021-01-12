import { webpack } from 'next/dist/compiled/webpack/webpack'
import { getModuleBuildError } from './webpackModuleError'

export class WellKnownErrorsPlugin {
  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap('WellKnownErrorsPlugin', (compilation) => {
      compilation.hooks.afterSeal.tapPromise(
        'WellKnownErrorsPlugin',
        async () => {
          if (compilation.errors?.length) {
            compilation.errors = await Promise.all(
              compilation.errors.map(async (err) => {
                try {
                  const moduleError = await getModuleBuildError(
                    compilation,
                    err
                  )
                  return moduleError === false ? err : moduleError
                } catch (e) {
                  console.log(e)
                  return err
                }
              })
            )
          }
        }
      )
    })
  }
}
