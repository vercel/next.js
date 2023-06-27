/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack/lib/javascript/BasicEvaluatedExpression'),
    ModuleFilenameHelpers: require('webpack/lib/ModuleFilenameHelpers'),
    NodeTargetPlugin: require('webpack/lib/node/NodeTargetPlugin'),
    NodeTemplatePlugin: require('webpack/lib/node/NodeTemplatePlugin'),
    LibraryTemplatePlugin: require('webpack/lib/LibraryTemplatePlugin'),
    LimitChunkCountPlugin: require('webpack/lib/optimize/LimitChunkCountPlugin'),
    WebWorkerTemplatePlugin: require('webpack/lib/webworker/WebWorkerTemplatePlugin'),
    ExternalsPlugin: require('webpack/lib/ExternalsPlugin'),
    SingleEntryPlugin: require('webpack/lib/SingleEntryPlugin'),
    FetchCompileAsyncWasmPlugin: require('webpack/lib/web/FetchCompileAsyncWasmPlugin'),
    FetchCompileWasmPlugin: require('webpack/lib/web/FetchCompileWasmPlugin'),
    StringXor: require('webpack/lib/util/StringXor'),
    NormalModule: require('webpack/lib/NormalModule'),
    sources: require('webpack').sources,
    webpack: require('webpack'),
    package: {
      version: require('webpack/package.json').version,
    },
  }
}
