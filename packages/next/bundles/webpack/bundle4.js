/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack4/lib/BasicEvaluatedExpression'),
    NodeEnvironmentPlugin: require('webpack4/lib/node/NodeEnvironmentPlugin'),
    NodeTargetPlugin: require('webpack4/lib/node/NodeTargetPlugin'),
    NodeTemplatePlugin: require('webpack4/lib/node/NodeTemplatePlugin'),
    ModuleFilenameHelpers: require('webpack4/lib/ModuleFilenameHelpers'),
    GraphHelpers: require('webpack4/lib/GraphHelpers'),
    Module: require('webpack4/lib/Module'),
    NormalModule: require('webpack4/lib/NormalModule'),
    Dependency: require('webpack4/lib/Dependency'),
    LibraryTemplatePlugin: require('webpack4/lib/LibraryTemplatePlugin'),
    SingleEntryPlugin: require('webpack4/lib/SingleEntryPlugin'),
    FetchCompileWasmTemplatePlugin: require('webpack4/lib/web/FetchCompileWasmTemplatePlugin'),
    LimitChunkCountPlugin: require('webpack4/lib/optimize/LimitChunkCountPlugin'),
    WebWorkerTemplatePlugin: require('webpack4/lib/webworker/WebWorkerTemplatePlugin'),
    ExternalsPlugin: require('webpack4/lib/ExternalsPlugin'),
    node: require('webpack4').node,
    util: require('webpack4').util,
    optimize: require('webpack4').optimize,
    sources: require('webpack-sources'),
    webpack: require('webpack4'),
    package: {
      version: require('webpack4/package.json').version,
    },
  }
}
