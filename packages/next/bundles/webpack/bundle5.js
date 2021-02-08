/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack5/lib/javascript/BasicEvaluatedExpression'),
    ModuleFilenameHelpers: require('webpack5/lib/ModuleFilenameHelpers'),
    NodeTargetPlugin: require('webpack5/lib/node/NodeTargetPlugin'),
    StringXor: require('webpack5/lib/util/StringXor'),
    SingleEntryPlugin: require('webpack5/lib/SingleEntryPlugin'),
    WebWorkerTemplatePlugin: require('webpack5/lib/webworker/WebWorkerTemplatePlugin'),
    ExternalsPlugin: require('webpack5/lib/ExternalsPlugin'),
    FetchCompileWasmPlugin: require('webpack5/lib/web/FetchCompileWasmPlugin'),
    FetchCompileAsyncWasmPlugin: require('webpack5/lib/web/FetchCompileAsyncWasmPlugin'),
    sources: require('webpack5').sources,
    webpack: require('webpack5'),
    package: {
      version: require('webpack5/package.json').version,
    },
  }
}
