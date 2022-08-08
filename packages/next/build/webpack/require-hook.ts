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
      'webpack/lib/node/NodeTemplatePlugin',
      'next/dist/compiled/webpack/NodeTemplatePlugin',
    ],
    [
      'webpack/lib/node/NodeTemplatePlugin.js',
      'next/dist/compiled/webpack/NodeTemplatePlugin',
    ],
    [
      'webpack/lib/LibraryTemplatePlugin',
      'next/dist/compiled/webpack/LibraryTemplatePlugin',
    ],
    [
      'webpack/lib/LibraryTemplatePlugin.js',
      'next/dist/compiled/webpack/LibraryTemplatePlugin',
    ],
    [
      'webpack/lib/SingleEntryPlugin',
      'next/dist/compiled/webpack/SingleEntryPlugin',
    ],
    [
      'webpack/lib/SingleEntryPlugin.js',
      'next/dist/compiled/webpack/SingleEntryPlugin',
    ],
    [
      'webpack/lib/optimize/LimitChunkCountPlugin',
      'next/dist/compiled/webpack/LimitChunkCountPlugin',
    ],
    [
      'webpack/lib/optimize/LimitChunkCountPlugin.js',
      'next/dist/compiled/webpack/LimitChunkCountPlugin',
    ],
    [
      'webpack/lib/webworker/WebWorkerTemplatePlugin',
      'next/dist/compiled/webpack/WebWorkerTemplatePlugin',
    ],
    [
      'webpack/lib/webworker/WebWorkerTemplatePlugin.js',
      'next/dist/compiled/webpack/WebWorkerTemplatePlugin',
    ],
    [
      'webpack/lib/ExternalsPlugin',
      'next/dist/compiled/webpack/ExternalsPlugin',
    ],
    [
      'webpack/lib/ExternalsPlugin.js',
      'next/dist/compiled/webpack/ExternalsPlugin',
    ],
    [
      'webpack/lib/web/FetchCompileWasmTemplatePlugin',
      'next/dist/compiled/webpack/FetchCompileWasmTemplatePlugin',
    ],
    [
      'webpack/lib/web/FetchCompileWasmTemplatePlugin.js',
      'next/dist/compiled/webpack/FetchCompileWasmTemplatePlugin',
    ],
    [
      'webpack/lib/web/FetchCompileWasmPlugin',
      'next/dist/compiled/webpack/FetchCompileWasmPlugin',
    ],
    [
      'webpack/lib/web/FetchCompileWasmPlugin.js',
      'next/dist/compiled/webpack/FetchCompileWasmPlugin',
    ],
    [
      'webpack/lib/web/FetchCompileAsyncWasmPlugin',
      'next/dist/compiled/webpack/FetchCompileAsyncWasmPlugin',
    ],
    [
      'webpack/lib/web/FetchCompileAsyncWasmPlugin.js',
      'next/dist/compiled/webpack/FetchCompileAsyncWasmPlugin',
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
    ['@babel/runtime', 'next/dist/compiled/@babel/runtime/package.json'],
    [
      '@babel/runtime/package.json',
      'next/dist/compiled/@babel/runtime/package.json',
    ],
    ['node-fetch', 'next/dist/compiled/node-fetch'],
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

// Flag as module for typescript
export {}
