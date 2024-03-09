import type { webpack } from 'next/dist/compiled/webpack/webpack'

import { getModuleBuildError } from './webpackModuleError'

const NAME = 'WellKnownErrorsPlugin'
export class WellKnownErrorsPlugin {
  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(NAME, (compilation) => {
      compilation.hooks.afterSeal.tapPromise(NAME, async () => {
        if (compilation.warnings?.length) {
          await Promise.all(
            compilation.warnings.map(async (warn, i) => {
              if (
                warn.name === 'ModuleDependencyWarning' &&
                warn.module?.context?.includes('node_modules')
              ) {
                compilation.warnings.splice(i, 1)
              }
            })
          )
        }

        if (compilation.errors?.length) {
          await Promise.all(
            compilation.errors.map(async (err, i) => {
              try {
                const moduleError = await getModuleBuildError(
                  compiler,
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
      })
    })
  }
}
