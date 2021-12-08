/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack5/lib/javascript/BasicEvaluatedExpression'),
    ModuleFilenameHelpers: require('webpack5/lib/ModuleFilenameHelpers'),
    NodeTargetPlugin: require('webpack5/lib/node/NodeTargetPlugin'),
    NodeTemplatePlugin: require('webpack5/lib/node/NodeTemplatePlugin'),
    LibraryTemplatePlugin: require('webpack5/lib/LibraryTemplatePlugin'),
    LimitChunkCountPlugin: require('webpack5/lib/optimize/LimitChunkCountPlugin'),
    WebWorkerTemplatePlugin: require('webpack5/lib/webworker/WebWorkerTemplatePlugin'),
    ExternalsPlugin: require('webpack5/lib/ExternalsPlugin'),
    SingleEntryPlugin: require('webpack5/lib/SingleEntryPlugin'),
    FetchCompileAsyncWasmPlugin: require('webpack5/lib/web/FetchCompileAsyncWasmPlugin'),
    FetchCompileWasmPlugin: require('webpack5/lib/web/FetchCompileWasmPlugin'),
    StringXor: require('webpack5/lib/util/StringXor'),
    NormalModule: require('webpack5/lib/NormalModule'),
    sources: require('webpack5').sources,
    webpack: require('webpack5'),
    package: {
      version: require('webpack5/package.json').version,
    },
  }
}
