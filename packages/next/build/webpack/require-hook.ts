// sync injects a hook for webpack and webpack/... requires to use the internal ncc webpack version
// this is in order for userland plugins to attach to the same webpack instance as next.js
// the individual compiled modules are as defined for the compilation in bundles/webpack/packages/*

const hookPropertyMap = new Map(
  [
    ['webpack', 'next/dist/compiled/webpack/webpack-lib'],
    ['webpack/package', 'next/dist/compiled/webpack/package'],
    ['webpack/package.json', 'next/dist/compiled/webpack/package'],
    ['webpack/lib/webpack', 'next/dist/compiled/webpack/webpack-lib'],
    ['webpack/lib/webpack.js', 'next/dist/compiled/webpack/webpack-lib'],
    [
      'webpack/lib/node/NodeEnvironmentPlugin',
      'next/dist/compiled/webpack/NodeEnvironmentPlugin',
    ],
    [
      'webpack/lib/node/NodeEnvironmentPlugin.js',
      'next/dist/compiled/webpack/NodeEnvironmentPlugin',
    ],
    [
      'webpack/lib/BasicEvaluatedExpression',
      'next/dist/compiled/webpack/BasicEvaluatedExpression',
    ],
    [
      'webpack/lib/BasicEvaluatedExpression.js',
      'next/dist/compiled/webpack/BasicEvaluatedExpression',
    ],
    [
      'webpack/lib/node/NodeTargetPlugin',
      'next/dist/compiled/webpack/NodeTargetPlugin',
    ],
    [
      'webpack/lib/node/NodeTargetPlugin.js',
      'next/dist/compiled/webpack/NodeTargetPlugin',
    ],
    [
      'webpack/lib/ModuleFilenameHelpers',
      'next/dist/compiled/webpack/ModuleFilenameHelpers',
    ],
    [
      'webpack/lib/ModuleFilenameHelpers.js',
      'next/dist/compiled/webpack/ModuleFilenameHelpers',
    ],
    ['webpack/lib/GraphHelpers', 'next/dist/compiled/webpack/GraphHelpers'],
    ['webpack/lib/GraphHelpers.js', 'next/dist/compiled/webpack/GraphHelpers'],
    ['webpack/lib/NormalModule', 'next/dist/compiled/webpack/NormalModule'],
    ['webpack-sources', 'next/dist/compiled/webpack/sources'],
    ['webpack-sources/lib', 'next/dist/compiled/webpack/sources'],
    ['webpack-sources/lib/index', 'next/dist/compiled/webpack/sources'],
    ['webpack-sources/lib/index.js', 'next/dist/compiled/webpack/sources'],
  ].map(([request, replacement]) => [request, require.resolve(replacement)])
)

const mod = require('module')
const resolveFilename = mod._resolveFilename
mod._resolveFilename = function (
  request: string,
  parent: any,
  isMain: boolean,
  options: any
) {
  const hookResolved = hookPropertyMap.get(request)
  if (hookResolved) request = hookResolved
  return resolveFilename.call(mod, request, parent, isMain, options)
}
