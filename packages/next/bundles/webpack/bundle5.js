/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack5/lib/javascript/BasicEvaluatedExpression'),
    ModuleFilenameHelpers: require('webpack5/lib/ModuleFilenameHelpers'),
    NodeTargetPlugin: require('webpack5/lib/node/NodeTargetPlugin'),
    StringXor: require('webpack5/lib/util/StringXor'),
    NormalModule: require('webpack/lib/NormalModule'),
    sources: require('webpack5').sources,
    webpack: require('webpack5'),
  }
}
