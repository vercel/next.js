/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack4/lib/BasicEvaluatedExpression'),
    NodeEnvironmentPlugin: require('webpack4/lib/node/NodeEnvironmentPlugin'),
    NodeTargetPlugin: require('webpack4/lib/node/NodeTargetPlugin'),
    ModuleFilenameHelpers: require('webpack4/lib/ModuleFilenameHelpers'),
    GraphHelpers: require('webpack4/lib/GraphHelpers'),
    Module: require('webpack4/lib/Module'),
    NormalModule: require('webpack4/lib/NormalModule'),
    Dependency: require('webpack4/lib/Dependency'),
    LibraryTemplatePlugin: require('webpack4/lib/LibraryTemplatePlugin'),
    SingleEntryPlugin: require('webpack4/lib/SingleEntryPlugin'),
    node: require('webpack4').node,
    util: require('webpack4').util,
    optimize: require('webpack4').optimize,
    sources: require('webpack4-sources'),
    webpack: require('webpack4'),
    package: {
      version: require('webpack4/package.json').version,
    },
  }
}
