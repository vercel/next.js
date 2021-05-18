/* eslint-disable import/no-extraneous-dependencies */

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

function eslintParser() {
  return require('@babel/eslint-parser')
}

function traverse() {
  return require('@babel/traverse')
}

function generator() {
  return require('@babel/generator')
}

function pluginProposalClassProperties() {
  return require('@babel/plugin-proposal-class-properties')
}

function pluginProposalExportNamespaceFrom() {
  return require('@babel/plugin-proposal-export-namespace-from')
}

function pluginProposalNumericSeparator() {
  return require('@babel/plugin-proposal-numeric-separator')
}

function pluginProposalObjectRestSpread() {
  return require('@babel/plugin-proposal-object-rest-spread')
}

function pluginSyntaxBigint() {
  return require('@babel/plugin-syntax-bigint')
}

function pluginSyntaxDynamicImport() {
  return require('@babel/plugin-syntax-dynamic-import')
}

function pluginSyntaxJsx() {
  return require('@babel/plugin-syntax-jsx')
}

function pluginTransformDefine() {
  return require('babel-plugin-transform-define')
}

function pluginTransformModulesCommonjs() {
  return require('@babel/plugin-transform-modules-commonjs')
}

function pluginTransformReactRemovePropTypes() {
  return require('babel-plugin-transform-react-remove-prop-types')
}

function pluginTransformRuntime() {
  return require('@babel/plugin-transform-runtime')
}

function presetEnv() {
  return require('@babel/preset-env')
}

function presetReact() {
  return require('@babel/preset-react')
}

function presetTypescript() {
  return require('@babel/preset-typescript')
}

module.exports = {
  codeFrame,
  core,
  coreLibConfig,
  coreLibNormalizeFile,
  coreLibNormalizeOpts,
  coreLibBlockHoistPlugin,
  coreLibPluginPass,
  eslintParser,
  generator,
  pluginProposalClassProperties,
  pluginProposalExportNamespaceFrom,
  pluginProposalNumericSeparator,
  pluginProposalObjectRestSpread,
  pluginSyntaxBigint,
  pluginSyntaxDynamicImport,
  pluginSyntaxJsx,
  pluginTransformDefine,
  pluginTransformModulesCommonjs,
  pluginTransformReactRemovePropTypes,
  pluginTransformRuntime,
  presetEnv,
  presetReact,
  presetTypescript,
  traverse,
}
