'use strict'

import ConstDependency from 'webpack/lib/dependencies/ConstDependency'

export default class WebpackConfigDependency extends ConstDependency {
  constructor (expression, nodeExpression, range) {
    super(expression, range)
    this.nodeExpression = nodeExpression
  }

  get type () {
    return 'webpack config'
  }
}

WebpackConfigDependency.Template = ConstDependency.Template
WebpackConfigDependency.NodeTemplate = class WebpackConfigDependencyTemplate {
  apply (dep, source) {
    const content = `require("next/webpack/buildin/node-config").${dep.nodeExpression}`
    source.replace(dep.range[0], dep.range[1] - 1, content)
  }
}
