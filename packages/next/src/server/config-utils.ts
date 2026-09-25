let installed: boolean = false

export function loadWebpackHook(webpackProjectDir: string) {
  if (installed) {
    return
  }
  installed = true

  const requireHook =
    require('../server/require-hook') as typeof import('../server/require-hook')
  const customWebpack = Boolean(process.env.NEXT_PRIVATE_LOCAL_WEBPACK)
  if (customWebpack) {
    try {
      require.resolve('webpack/package.json', { paths: [webpackProjectDir] })
    } catch (cause) {
      installed = false
      throw new Error(
        '`--custom-webpack` requires webpack to be installed in your project. Install it with `npm install --save-dev webpack`.',
        { cause }
      )
    }
  }

  const webpackAliases: [string, string][] = [
    ['webpack', 'next/dist/compiled/webpack/webpack-lib'],
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
  ]

  // Only bundled webpack needs require aliases. With `--custom-webpack`,
  // webpack and webpack-sources resolve normally from the project.
  requireHook.addHookAliases(
    [
      ...(customWebpack ? [] : webpackAliases),
      ['@babel/runtime', 'next/dist/compiled/@babel/runtime/package.json'],
      [
        '@babel/runtime/package.json',
        'next/dist/compiled/@babel/runtime/package.json',
      ],
    ].map(
      // Use dynamic require.resolve to avoid statically analyzable since
      // these replacements are only needed at build time.
      ([request, replacement]) => [request, require.resolve(replacement)]
    )
  )
}
