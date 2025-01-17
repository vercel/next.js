import curry from 'next/dist/compiled/lodash.curry'
import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { COMPILER_NAMES } from '../../../../shared/lib/constants'
import type { ConfigurationContext } from '../utils'
import DevToolsIgnorePlugin from '../../plugins/devtools-ignore-list-plugin'
import EvalSourceMapDevToolPlugin from '../../plugins/eval-source-map-dev-tool-plugin'

function shouldIgnorePath(modulePath: string): boolean {
  return (
    modulePath.includes('node_modules') ||
    // Only relevant for when Next.js is symlinked e.g. in the Next.js monorepo
    modulePath.includes('next/dist')
  )
}

export const base = curry(function base(
  ctx: ConfigurationContext,
  config: webpack.Configuration
) {
  config.mode = ctx.isDevelopment ? 'development' : 'production'
  config.name = ctx.isServer
    ? ctx.isEdgeRuntime
      ? COMPILER_NAMES.edgeServer
      : COMPILER_NAMES.server
    : COMPILER_NAMES.client

  config.target = !ctx.targetWeb
    ? 'node18.17' // Same version defined in packages/next/package.json#engines
    : ctx.isEdgeRuntime
      ? ['web', 'es6']
      : ['web', 'es6']

  // https://webpack.js.org/configuration/devtool/#development
  if (ctx.isDevelopment) {
    if (process.env.__NEXT_TEST_MODE && !process.env.__NEXT_TEST_WITH_DEVTOOL) {
      config.devtool = false
    } else {
      // `eval-source-map` provides full-fidelity source maps for the
      // original source, including columns and original variable names.
      // This is desirable so the in-browser debugger can correctly pause
      // and show scoped variables with their original names.
      config.devtool = 'eval-source-map'
    }
  } else {
    if (
      ctx.isEdgeRuntime ||
      (ctx.isServer && ctx.serverSourceMaps) ||
      // Enable browser sourcemaps:
      (ctx.productionBrowserSourceMaps && ctx.isClient)
    ) {
      config.devtool = 'source-map'
      config.plugins ??= []
      config.plugins.push(
        new DevToolsIgnorePlugin({
          // TODO: eval-source-map has different module paths than source-map.
          // We're currently not actually ignore listing anything.
          shouldIgnorePath,
        })
      )
    } else {
      config.devtool = false
    }
  }

  if (!config.module) {
    config.module = { rules: [] }
  }

  config.plugins ??= []
  if (config.devtool === 'source-map') {
    config.plugins.push(
      new DevToolsIgnorePlugin({
        shouldIgnorePath,
      })
    )
  } else if (config.devtool === 'eval-source-map') {
    // We're using a fork of `eval-source-map`
    config.devtool = false
    config.plugins.push(
      new EvalSourceMapDevToolPlugin({
        moduleFilenameTemplate: config.output?.devtoolModuleFilenameTemplate,
        shouldIgnorePath,
      })
    )
  }

  // TODO: add codemod for "Should not import the named export" with JSON files
  // config.module.strictExportPresence = !isWebpack5

  return config
})
