import { createRequire } from 'module'

let installed: boolean = false

export function loadWebpackHook() {
  if (installed) {
    return
  }
  installed = true

  // hook the Node.js require so that webpack requires are
  // routed to the bundled and now initialized webpack version
  ;(
    require('../server/require-hook') as typeof import('../server/require-hook')
  ).addHookAliases(
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

export function loadCustomWebpackHook(webpackProjectDir: string) {
  // Ensure the require hook and its bundled webpack aliases are initialized.
  loadWebpackHook()

  const requireHook =
    require('../server/require-hook') as typeof import('../server/require-hook')
  const isWebpackAlias = (request: string) =>
    request === 'webpack' ||
    request.startsWith('webpack/') ||
    request === 'webpack-sources' ||
    request.startsWith('webpack-sources/')
  const localWebpackRequests = [
    'webpack/lib/javascript/BasicEvaluatedExpression',
    'webpack/lib/optimize/ConcatenatedModule',
    'webpack/lib/util/identifier',
    'webpack/lib/RuntimeGlobals',
    'webpack/lib/SourceMapDevToolModuleOptionsPlugin',
    'webpack/lib/util/StringXor',
  ]
  const webpackAliasNames = [
    ...Array.from(requireHook.hookPropertyMap.keys()).filter(isWebpackAlias),
    ...localWebpackRequests,
  ]
  const previousAliases = webpackAliasNames.flatMap(
    (request): [string, string][] => {
      const replacement = requireHook.hookPropertyMap.get(request)
      return replacement ? [[request, replacement]] : []
    }
  )

  // Stop the bundled aliases from intercepting resolution of the project's
  // webpack package.
  requireHook.removeHookAliases(webpackAliasNames)

  let webpackRequire: NodeRequire
  try {
    const webpackPackagePath = require.resolve('webpack/package.json', {
      paths: [webpackProjectDir],
    })
    webpackRequire = createRequire(webpackPackagePath)
  } catch (cause) {
    // Leave the process using bundled webpack when custom webpack could not be
    // activated. This matters when callers catch and report the config error.
    requireHook.addHookAliases(previousAliases)
    throw new Error(
      '`experimental.customWebpack` requires webpack to be installed in your project. Install it with `npm install --save-dev webpack`.',
      { cause }
    )
  }

  requireHook.addHookAliases(
    webpackAliasNames.flatMap((request): [string, string][] => {
      let localRequest = request
      if (request === 'webpack/package') {
        localRequest = 'webpack/package.json'
      } else if (
        request === 'webpack-sources' ||
        request.startsWith('webpack-sources/')
      ) {
        localRequest = 'webpack-sources'
      }

      try {
        return [[request, webpackRequire.resolve(localRequest)]]
      } catch {
        // Older compatibility aliases are not present in every supported
        // webpack version. Let Node report the missing deep import if used.
        return []
      }
    })
  )
}
