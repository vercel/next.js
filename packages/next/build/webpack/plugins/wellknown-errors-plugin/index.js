'use strict'

exports.__esModule = true
exports.WellKnownErrorsPlugin = void 0

var _webpackModuleError = require('./webpackModuleError')

class WellKnownErrorsPlugin {
  apply(compiler) {
    compiler.hooks.compilation.tap('WellKnownErrorsPlugin', (compilation) => {
      compilation.hooks.afterSeal.tapPromise(
        'WellKnownErrorsPlugin',
        async () => {
          var _compilation$errors

          if (
            (_compilation$errors = compilation.errors) != null &&
            _compilation$errors.length
          ) {
            compilation.errors = await Promise.all(
              compilation.errors.map(async (err) => {
                try {
                  const moduleError = await (0,
                  _webpackModuleError.getModuleBuildError)(compilation, err)
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

exports.WellKnownErrorsPlugin = WellKnownErrorsPlugin
//# sourceMappingURL=index.js.map
