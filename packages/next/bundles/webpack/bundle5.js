/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack/lib/javascript/BasicEvaluatedExpression'),
    ModuleFilenameHelpers: require('webpack/lib/ModuleFilenameHelpers'),
    NodeTargetPlugin: require('webpack/lib/node/NodeTargetPlugin'),
    StringXor: require('webpack/lib/util/StringXor'),
    NormalModule: require('webpack/lib/NormalModule'),
    sources: require('webpack').sources,
    webpack: require('webpack'),
  }
}
