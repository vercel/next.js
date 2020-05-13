import { Compiler } from 'webpack'
import { getModuleBuildError } from './webpackModuleError'

export class WellKnownErrorsPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.done.tapPromise('WellKnownErrorsPlugin', async stats => {
      if (stats.hasErrors()) {
        stats.compilation.errors = stats.compilation.errors.map(err => {
          const moduleError = getModuleBuildError(stats.compilation, err)
          return moduleError === false ? err : moduleError
        })
      }
    })
  }
}
