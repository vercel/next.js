/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack/lib/BasicEvaluatedExpression'),
    NodeTargetPlugin: require('webpack/lib/node/NodeTargetPlugin'),
    ModuleFilenameHelpers: require('webpack/lib/ModuleFilenameHelpers'),
    GraphHelpers: require('webpack/lib/GraphHelpers'),
    RawSource: require('webpack-sources').RawSource,
    SourceMapSource: require('webpack-sources').SourceMapSource,
    webpack: require('webpack'),
  }
}
