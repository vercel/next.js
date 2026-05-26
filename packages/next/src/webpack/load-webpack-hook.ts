let installed = false

export function loadWebpackHook() {
  if (installed) {
    return
  }
  installed = true
  ;(
    require('next/dist/server/require-hook') as typeof import('next/dist/server/require-hook')
  ).addHookAliases(
    [
      ['webpack', './compiled/webpack/webpack-lib'],
      ['webpack/package', './compiled/webpack/package'],
      ['webpack/package.json', './compiled/webpack/package'],
      ['webpack/lib/webpack', './compiled/webpack/webpack-lib'],
      ['webpack/lib/webpack.js', './compiled/webpack/webpack-lib'],
      [
        'webpack/lib/node/NodeEnvironmentPlugin',
        './compiled/webpack/NodeEnvironmentPlugin',
      ],
      [
        'webpack/lib/node/NodeEnvironmentPlugin.js',
        './compiled/webpack/NodeEnvironmentPlugin',
      ],
      [
        'webpack/lib/BasicEvaluatedExpression',
        './compiled/webpack/BasicEvaluatedExpression',
      ],
      [
        'webpack/lib/BasicEvaluatedExpression.js',
        './compiled/webpack/BasicEvaluatedExpression',
      ],
      [
        'webpack/lib/node/NodeTargetPlugin',
        './compiled/webpack/NodeTargetPlugin',
      ],
      [
        'webpack/lib/node/NodeTargetPlugin.js',
        './compiled/webpack/NodeTargetPlugin',
      ],
      [
        'webpack/lib/node/NodeTemplatePlugin',
        './compiled/webpack/NodeTemplatePlugin',
      ],
      [
        'webpack/lib/node/NodeTemplatePlugin.js',
        './compiled/webpack/NodeTemplatePlugin',
      ],
      [
        'webpack/lib/LibraryTemplatePlugin',
        './compiled/webpack/LibraryTemplatePlugin',
      ],
      [
        'webpack/lib/LibraryTemplatePlugin.js',
        './compiled/webpack/LibraryTemplatePlugin',
      ],
      ['webpack/lib/SingleEntryPlugin', './compiled/webpack/SingleEntryPlugin'],
      [
        'webpack/lib/SingleEntryPlugin.js',
        './compiled/webpack/SingleEntryPlugin',
      ],
      [
        'webpack/lib/optimize/LimitChunkCountPlugin',
        './compiled/webpack/LimitChunkCountPlugin',
      ],
      [
        'webpack/lib/optimize/LimitChunkCountPlugin.js',
        './compiled/webpack/LimitChunkCountPlugin',
      ],
      [
        'webpack/lib/webworker/WebWorkerTemplatePlugin',
        './compiled/webpack/WebWorkerTemplatePlugin',
      ],
      [
        'webpack/lib/webworker/WebWorkerTemplatePlugin.js',
        './compiled/webpack/WebWorkerTemplatePlugin',
      ],
      ['webpack/lib/ExternalsPlugin', './compiled/webpack/ExternalsPlugin'],
      ['webpack/lib/ExternalsPlugin.js', './compiled/webpack/ExternalsPlugin'],
      [
        'webpack/lib/web/FetchCompileWasmTemplatePlugin',
        './compiled/webpack/FetchCompileWasmTemplatePlugin',
      ],
      [
        'webpack/lib/web/FetchCompileWasmTemplatePlugin.js',
        './compiled/webpack/FetchCompileWasmTemplatePlugin',
      ],
      [
        'webpack/lib/web/FetchCompileWasmPlugin',
        './compiled/webpack/FetchCompileWasmPlugin',
      ],
      [
        'webpack/lib/web/FetchCompileWasmPlugin.js',
        './compiled/webpack/FetchCompileWasmPlugin',
      ],
      [
        'webpack/lib/web/FetchCompileAsyncWasmPlugin',
        './compiled/webpack/FetchCompileAsyncWasmPlugin',
      ],
      [
        'webpack/lib/web/FetchCompileAsyncWasmPlugin.js',
        './compiled/webpack/FetchCompileAsyncWasmPlugin',
      ],
      [
        'webpack/lib/ModuleFilenameHelpers',
        './compiled/webpack/ModuleFilenameHelpers',
      ],
      [
        'webpack/lib/ModuleFilenameHelpers.js',
        './compiled/webpack/ModuleFilenameHelpers',
      ],
      ['webpack/lib/GraphHelpers', './compiled/webpack/GraphHelpers'],
      ['webpack/lib/GraphHelpers.js', './compiled/webpack/GraphHelpers'],
      ['webpack/lib/NormalModule', './compiled/webpack/NormalModule'],
      ['webpack-sources', './compiled/webpack/sources'],
      ['webpack-sources/lib', './compiled/webpack/sources'],
      ['webpack-sources/lib/index', './compiled/webpack/sources'],
      ['webpack-sources/lib/index.js', './compiled/webpack/sources'],
      ['@babel/runtime', 'next/dist/compiled/@babel/runtime/package.json'],
      [
        '@babel/runtime/package.json',
        'next/dist/compiled/@babel/runtime/package.json',
      ],
    ].map(([request, replacement]) => [
      request,
      replacement.startsWith('.')
        ? require.resolve(replacement)
        : require.resolve(replacement),
    ])
  )
}
