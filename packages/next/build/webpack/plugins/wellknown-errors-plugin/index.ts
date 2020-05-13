import { Compiler } from 'webpack'
import { getModuleBuildError } from './webpackModuleError'

export class WellKnownErrorsPlugin {
  apply(compiler: Compiler) {
    compiler.hooks.compilation.tap('WellKnownErrorsPlugin', compilation => {
      compilation.hooks.seal.tap('WellKnownErrorsPlugin', () => {
        if (compilation.errors?.length) {
          compilation.errors = compilation.errors.map(err => {
            const moduleError = getModuleBuildError(compilation, err)
            return moduleError === false ? err : moduleError
          })
        }
      })
    })
  }
}
