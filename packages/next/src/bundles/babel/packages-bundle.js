/* eslint-disable import/no-extraneous-dependencies */

function eslintParser() {
  return require('@babel/eslint-parser')
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

function pluginSyntaxImportAssertions() {
  return require('@babel/plugin-syntax-import-assertions')
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
  eslintParser,
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
