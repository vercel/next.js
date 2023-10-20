let installed: boolean = false

export function loadWebpackHook() {
  const { init: initWebpack } = require('next/dist/compiled/webpack/webpack')
  if (installed) {
    return
  }
  installed = true
  initWebpack()

  // hook the Node.js require so that webpack requires are
  // routed to the bundled and now initialized webpack version
  require('../server/require-hook').addHookAliases(
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
      [
        'webpack/lib/GraphHelpers.js',
        'next/dist/compiled/webpack/GraphHelpers',
      ],
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
    ].map(
      // Use dynamic require.resolve to avoid statically analyzable since they're only for build time
      ([request, replacement]) => [request, require.resolve(replacement)]
    )
  )
}
