/* eslint-disable import/no-extraneous-dependencies */

function types() {
  return require('@babel/types')
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
  return require('next/dist/compiled/babel-packages').eslintParser()
}

function pluginProposalClassProperties() {
  return require('next/dist/compiled/babel-packages').pluginProposalClassProperties()
}

function pluginProposalExportNamespaceFrom() {
  return require('next/dist/compiled/babel-packages').pluginProposalExportNamespaceFrom()
}

function pluginProposalNumericSeparator() {
  return require('next/dist/compiled/babel-packages').pluginProposalNumericSeparator()
}

function pluginProposalObjectRestSpread() {
  return require('next/dist/compiled/babel-packages').pluginProposalObjectRestSpread()
}

function pluginSyntaxBigint() {
  return require('next/dist/compiled/babel-packages').pluginSyntaxBigint()
}

function pluginSyntaxDynamicImport() {
  return require('next/dist/compiled/babel-packages').pluginSyntaxDynamicImport()
}

function pluginSyntaxImportAttributes() {
  return require('next/dist/compiled/babel-packages').pluginSyntaxImportAttributes()
}

function pluginSyntaxJsx() {
  return require('next/dist/compiled/babel-packages').pluginSyntaxJsx()
}

function pluginSyntaxTypescript() {
  return require('next/dist/compiled/babel-packages').pluginSyntaxTypescript()
}

function pluginTransformDefine() {
  return require('next/dist/compiled/babel-packages').pluginTransformDefine()
}

function pluginTransformModulesCommonjs() {
  return require('next/dist/compiled/babel-packages').pluginTransformModulesCommonjs()
}

function pluginTransformReactRemovePropTypes() {
  return require('next/dist/compiled/babel-packages').pluginTransformReactRemovePropTypes()
}

function pluginTransformRuntime() {
  return require('next/dist/compiled/babel-packages').pluginTransformRuntime()
}

function presetEnv() {
  return require('next/dist/compiled/babel-packages').presetEnv()
}

function presetReact() {
  return require('next/dist/compiled/babel-packages').presetReact()
}

function presetTypescript() {
  return require('next/dist/compiled/babel-packages').presetTypescript()
}

module.exports = {
  types,
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
  pluginSyntaxImportAttributes,
  pluginSyntaxJsx,
  pluginSyntaxTypescript,
  pluginTransformDefine,
  pluginTransformModulesCommonjs,
  pluginTransformReactRemovePropTypes,
  pluginTransformRuntime,
  presetEnv,
  presetReact,
  presetTypescript,
}
