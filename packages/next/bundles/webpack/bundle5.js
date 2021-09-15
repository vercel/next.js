/* eslint-disable import/no-extraneous-dependencies */

module.exports = function () {
  return {
    BasicEvaluatedExpression: require('webpack5/lib/javascript/BasicEvaluatedExpression'),
    ModuleFilenameHelpers: require('webpack5/lib/ModuleFilenameHelpers'),
    NodeTargetPlugin: require('webpack5/lib/node/NodeTargetPlugin'),
    NodeTemplatePlugin: require('webpack5/lib/node/NodeTemplatePlugin'),
    LibraryTemplatePlugin: require('webpack5/lib/LibraryTemplatePlugin'),
    SingleEntryPlugin: require('webpack5/lib/SingleEntryPlugin'),
    StringXor: require('webpack5/lib/util/StringXor'),
    NormalModule: require('webpack5/lib/NormalModule'),
    sources: require('webpack5').sources,
    webpack: require('webpack5'),
  }
}
