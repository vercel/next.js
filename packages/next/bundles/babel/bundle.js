/* eslint-disable import/no-extraneous-dependencies */

function codeFrame() {
  return require('@babel/code-frame')
}

function core() {
  return require('@babel/core')
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

function pluginTransformModulesCommonjs() {
  return require('@babel/plugin-transform-modules-commonjs')
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
  pluginProposalClassProperties,
  pluginProposalExportNamespaceFrom,
  pluginProposalNumericSeparator,
  pluginProposalObjectRestSpread,
  pluginSyntaxBigint,
  pluginSyntaxDynamicImport,
  pluginSyntaxJsx,
  pluginTransformModulesCommonjs,
  pluginTransformRuntime,
  presetEnv,
  presetReact,
  presetTypescript,
}
