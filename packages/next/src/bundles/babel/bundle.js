/* eslint-disable import/no-extraneous-dependencies */

function types() {
  return require('@babel/types')
}

function codeFrame() {
  return require('@babel/code-frame')
}

function core() {
  return require('@babel/core')
}

function coreLibConfig() {
  return require('@babel/core/lib/config')
}

function coreLibNormalizeFile() {
  return require('@babel/core/lib/transformation/normalize-file')
}

function coreLibNormalizeOpts() {
  return require('@babel/core/lib/transformation/normalize-opts')
}

function coreLibBlockHoistPlugin() {
  return require('@babel/core/lib/transformation/block-hoist-plugin')
}

function coreLibPluginPass() {
  return require('@babel/core/lib/transformation/plugin-pass')
}

function traverse() {
  return require('@babel/traverse')
}

function generator() {
  return require('@babel/generator')
}

function parser() {
  return require('@babel/parser')
}

function eslintParser() {
  return require('babel-packages').eslintParser()
}

function pluginProposalClassProperties() {
  return require('babel-packages').pluginProposalClassProperties()
}

function pluginProposalExportNamespaceFrom() {
  return require('babel-packages').pluginProposalExportNamespaceFrom()
}

function pluginProposalNumericSeparator() {
  return require('babel-packages').pluginProposalNumericSeparator()
}

function pluginProposalObjectRestSpread() {
  return require('babel-packages').pluginProposalObjectRestSpread()
}

function pluginSyntaxBigint() {
  return require('babel-packages').pluginSyntaxBigint()
}

function pluginSyntaxDynamicImport() {
  return require('babel-packages').pluginSyntaxDynamicImport()
}

function pluginSyntaxImportAssertions() {
  return require('babel-packages').pluginSyntaxImportAssertions()
}

function pluginSyntaxJsx() {
  return require('babel-packages').pluginSyntaxJsx()
}

function pluginTransformDefine() {
  return require('babel-packages').pluginTransformDefine()
}

function pluginTransformModulesCommonjs() {
  return require('babel-packages').pluginTransformModulesCommonjs()
}

function pluginTransformReactRemovePropTypes() {
  return require('babel-packages').pluginTransformReactRemovePropTypes()
}

function pluginTransformRuntime() {
  return require('babel-packages').pluginTransformRuntime()
}

function presetEnv() {
  return require('babel-packages').presetEnv()
}

function presetReact() {
  return require('babel-packages').presetReact()
}

function presetTypescript() {
  return require('babel-packages').presetTypescript()
}

module.exports = {
  types,
  codeFrame,
  core,
  coreLibConfig,
  coreLibNormalizeFile,
  coreLibNormalizeOpts,
  coreLibBlockHoistPlugin,
  coreLibPluginPass,
  generator,
  traverse,
  eslintParser,
  parser,
  pluginProposalClassProperties,
  pluginProposalExportNamespaceFrom,
  pluginProposalNumericSeparator,
  pluginProposalObjectRestSpread,
  pluginSyntaxBigint,
  pluginSyntaxDynamicImport,
  pluginSyntaxImportAssertions,
  pluginSyntaxJsx,
  pluginTransformDefine,
  pluginTransformModulesCommonjs,
  pluginTransformReactRemovePropTypes,
  pluginTransformRuntime,
  presetEnv,
  presetReact,
  presetTypescript,
}
