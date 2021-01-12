/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack5/lib/javascript/BasicEvaluatedExpression'),
    ModuleFilenameHelpers: require('webpack5/lib/ModuleFilenameHelpers'),
    NodeTargetPlugin: require('webpack5/lib/node/NodeTargetPlugin'),
    StringXor: require('webpack5/lib/util/StringXor'),
    RawSource: require('webpack5').sources.RawSource,
    SourceMapSource: require('webpack5').sources.SourceMapSource,
    webpack: require('webpack5'),
  }
}
