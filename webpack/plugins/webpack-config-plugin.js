'use strict'

import ParserHelpers from 'webpack/lib/ParserHelpers'
import NullFactory from 'webpack/lib/NullFactory'
import WebpackConfigDependency from '../dependencies/webpack-config'

export default class WebpackConfigPlugin {
  apply (compiler) {
    compiler.plugin('compilation', (compilation, params) => {
      compilation.dependencyFactories.set(
        WebpackConfigDependency,
        new NullFactory()
      )
      compilation.dependencyTemplates.set(
        WebpackConfigDependency,
        new WebpackConfigDependency.Template()
      )

      params.normalModuleFactory.plugin('parser', (parser) => {
        parser.plugin(
          'expression __webpack_public_path__',
          function publicPathExpression (expr) {
            const dep = new WebpackConfigDependency(
              '__webpack_require__.p',
              'publicPath',
              expr.range
            )
            dep.loc = expr.loc
            this.state.current.addDependency(dep)
            return true
          }
        )

        parser.plugin(
          'evaluate typeof __webpack_public_path__',
          ParserHelpers.evaluateToString('string')
        )
      })
    })
  }
}
