/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack/lib/BasicEvaluatedExpression'),
    NodeEnvironmentPlugin: require('webpack/lib/node/NodeEnvironmentPlugin'),
    NodeTargetPlugin: require('webpack/lib/node/NodeTargetPlugin'),
    ModuleFilenameHelpers: require('webpack/lib/ModuleFilenameHelpers'),
    GraphHelpers: require('webpack/lib/GraphHelpers'),
    Module: require('webpack/lib/Module'),
    NormalModule: require('webpack/lib/NormalModule'),
    Dependency: require('webpack/lib/Dependency'),
    LibraryTemplatePlugin: require('webpack/lib/LibraryTemplatePlugin'),
    SingleEntryPlugin: require('webpack/lib/SingleEntryPlugin'),
    node: require('webpack').node,
    util: require('webpack').util,
    optimize: require('webpack').optimize,
    sources: require('webpack-sources'),
    webpack: require('webpack'),
    package: {
      version: require('webpack/package.json').version,
    },
  }
}
