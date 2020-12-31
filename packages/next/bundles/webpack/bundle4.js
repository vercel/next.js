/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    default: require('webpack'),
    BasicEvaluatedExpression: require('webpack/lib/BasicEvaluatedExpression'),
    NodeTargetPlugin: require('webpack/lib/node/NodeTargetPlugin'),
    ModuleFilenameHelpers: require('webpack/lib/ModuleFilenameHelpers'),
    GraphHelpers: require('webpack/lib/GraphHelpers'),
    sources: require('webpack-sources'),
  }
}
