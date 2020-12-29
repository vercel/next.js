/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    default: require('webpack5'),
    BasicEvaluatedExpression: require('webpack5/lib/javascript/BasicEvaluatedExpression'),
    ModuleFilenameHelpers: require('webpack5/lib/ModuleFilenameHelpers'),
    NodeTargetPlugin: require('webpack5/lib/node/NodeTargetPlugin'),
    StringXor: require('webpack5/lib/util/StringXor'),
  }
}
