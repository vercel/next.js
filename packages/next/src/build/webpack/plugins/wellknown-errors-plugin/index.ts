import type { webpack } from 'next/dist/compiled/webpack/webpack'

import { getModuleBuildError } from './webpackModuleError'

const NAME = 'WellKnownErrorsPlugin'
export class WellKnownErrorsPlugin {
  apply(compiler: webpack.Compiler) {
    compiler.hooks.compilation.tap(NAME, (compilation) => {
      compilation.hooks.afterSeal.tapPromise(NAME, async () => {
        if (compilation.warnings?.length) {
          // Suppress ModuleDependencyWarnings originating in node_modules.
          // Build a new array instead of splicing during the index-based
          // iteration: each splice shifts later elements left, skipping the
          // element right after a removed one and deleting unrelated
          // first-party warnings at stale indices.
          compilation.warnings = compilation.warnings.filter(
            (warn) =>
              !(
                warn.name === 'ModuleDependencyWarning' &&
                warn.module?.context?.includes('node_modules')
              )
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
