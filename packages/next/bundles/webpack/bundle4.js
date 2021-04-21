/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack/lib/BasicEvaluatedExpression'),
    NodeEnvironmentPlugin: require('webpack/lib/node/NodeEnvironmentPlugin'),
    NodeTargetPlugin: require('webpack/lib/node/NodeTargetPlugin'),
    ModuleFilenameHelpers: require('webpack/lib/ModuleFilenameHelpers'),
    GraphHelpers: require('webpack/lib/GraphHelpers'),
    sources: require('webpack-sources'),
    webpack: require('webpack'),
    package: {
      version: require('webpack/package.json').version,
    },
  }
}
