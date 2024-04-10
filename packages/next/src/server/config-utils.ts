let installed: boolean = false

export function loadWebpackHook() {
  const { init: initWebpack } = require('webpack/webpack')
  if (installed) {
    return
  }
  installed = true
  initWebpack()

  // hook the Node.js require so that webpack requires are
  // routed to the bundled and now initialized webpack version
  require('../server/require-hook').addHookAliases(
    [
      ['webpack', 'webpack/webpack-lib'],
      ['webpack/package', 'webpack/package'],
      ['webpack/package.json', 'webpack/package'],
      ['webpack/lib/webpack', 'webpack/webpack-lib'],
      ['webpack/lib/webpack.js', 'webpack/webpack-lib'],
      [
        'webpack/lib/node/NodeEnvironmentPlugin',
        'webpack/NodeEnvironmentPlugin',
      ],
      [
        'webpack/lib/node/NodeEnvironmentPlugin.js',
        'webpack/NodeEnvironmentPlugin',
      ],
      [
        'webpack/lib/BasicEvaluatedExpression',
        'webpack/BasicEvaluatedExpression',
      ],
      [
        'webpack/lib/BasicEvaluatedExpression.js',
        'webpack/BasicEvaluatedExpression',
      ],
      ['webpack/lib/node/NodeTargetPlugin', 'webpack/NodeTargetPlugin'],
      ['webpack/lib/node/NodeTargetPlugin.js', 'webpack/NodeTargetPlugin'],
      ['webpack/lib/node/NodeTemplatePlugin', 'webpack/NodeTemplatePlugin'],
      ['webpack/lib/node/NodeTemplatePlugin.js', 'webpack/NodeTemplatePlugin'],
      ['webpack/lib/LibraryTemplatePlugin', 'webpack/LibraryTemplatePlugin'],
      ['webpack/lib/LibraryTemplatePlugin.js', 'webpack/LibraryTemplatePlugin'],
      ['webpack/lib/SingleEntryPlugin', 'webpack/SingleEntryPlugin'],
      ['webpack/lib/SingleEntryPlugin.js', 'webpack/SingleEntryPlugin'],
      [
        'webpack/lib/optimize/LimitChunkCountPlugin',
        'webpack/LimitChunkCountPlugin',
      ],
      [
        'webpack/lib/optimize/LimitChunkCountPlugin.js',
        'webpack/LimitChunkCountPlugin',
      ],
      [
        'webpack/lib/webworker/WebWorkerTemplatePlugin',
        'webpack/WebWorkerTemplatePlugin',
      ],
      [
        'webpack/lib/webworker/WebWorkerTemplatePlugin.js',
        'webpack/WebWorkerTemplatePlugin',
      ],
      ['webpack/lib/ExternalsPlugin', 'webpack/ExternalsPlugin'],
      ['webpack/lib/ExternalsPlugin.js', 'webpack/ExternalsPlugin'],
      [
        'webpack/lib/web/FetchCompileWasmTemplatePlugin',
        'webpack/FetchCompileWasmTemplatePlugin',
      ],
      [
        'webpack/lib/web/FetchCompileWasmTemplatePlugin.js',
        'webpack/FetchCompileWasmTemplatePlugin',
      ],
      [
        'webpack/lib/web/FetchCompileWasmPlugin',
        'webpack/FetchCompileWasmPlugin',
      ],
      [
        'webpack/lib/web/FetchCompileWasmPlugin.js',
        'webpack/FetchCompileWasmPlugin',
      ],
      [
        'webpack/lib/web/FetchCompileAsyncWasmPlugin',
        'webpack/FetchCompileAsyncWasmPlugin',
      ],
      [
        'webpack/lib/web/FetchCompileAsyncWasmPlugin.js',
        'webpack/FetchCompileAsyncWasmPlugin',
      ],
      ['webpack/lib/ModuleFilenameHelpers', 'webpack/ModuleFilenameHelpers'],
      ['webpack/lib/ModuleFilenameHelpers.js', 'webpack/ModuleFilenameHelpers'],
      ['webpack/lib/GraphHelpers', 'webpack/GraphHelpers'],
      ['webpack/lib/GraphHelpers.js', 'webpack/GraphHelpers'],
      ['webpack/lib/NormalModule', 'webpack/NormalModule'],
      ['webpack-sources', 'webpack/sources'],
      ['webpack-sources/lib', 'webpack/sources'],
      ['webpack-sources/lib/index', 'webpack/sources'],
      ['webpack-sources/lib/index.js', 'webpack/sources'],
      ['@babel/runtime', '@babel/runtime/package.json'],
      ['@babel/runtime/package.json', '@babel/runtime/package.json'],
    ].map(
      // Use dynamic require.resolve to avoid statically analyzable since they're only for build time
      ([request, replacement]) => [request, require.resolve(replacement)]
    )
  )
}
