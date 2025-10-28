/* eslint-disable import/no-extraneous-dependencies */

function eslintParser() {
  return require('@babel/eslint-parser')
}

function pluginProposalClassProperties() {
  return require('@babel/plugin-transform-class-properties')
}

function pluginProposalExportNamespaceFrom() {
  return require('@babel/plugin-transform-export-namespace-from')
}

function pluginProposalNumericSeparator() {
  return require('@babel/plugin-transform-numeric-separator')
}

function pluginProposalObjectRestSpread() {
  return require('@babel/plugin-transform-object-rest-spread')
}

function pluginSyntaxBigint() {
  return require('@babel/plugin-syntax-bigint')
}

function pluginSyntaxDynamicImport() {
  return require('@babel/plugin-syntax-dynamic-import')
}

function pluginSyntaxImportAttributes() {
  return require('@babel/plugin-syntax-import-attributes')
}

function pluginSyntaxJsx() {
  return require('@babel/plugin-syntax-jsx')
}

function pluginSyntaxTypescript() {
  return require('@babel/plugin-syntax-typescript')
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
