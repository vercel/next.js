import { webpack } from 'next/dist/compiled/webpack/webpack'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'

/**
 * Produce source maps for middlewares.
 * Currently we use the same compiler for browser and middlewares,
 * so we can avoid having the custom plugins if the browser source maps
 * are emitted.
 */
export const getMiddlewareSourceMapPlugins = (params: {
  isConfigured: boolean
  isProductionBrowserSourceMapsOn: boolean
}) => {
  if (!params.isConfigured || params.isProductionBrowserSourceMapsOn) {
    return []
  }

  return [
    new webpack.SourceMapDevToolPlugin({
      filename: '[file].map',
      include: [
        // Middlewares are the only ones who have `server/pages/[name]` as their filename
        /^server\/pages\//,
        // All middleware chunks
        /^server\/middleware-chunks\//,
      ],
    }),
    new MiddlewareSourceMapsPlugin(),
  ]
}

/**
 * Produce source maps for middlewares.
 * Currently we use the same compiler for browser and middlewares,
 * so we can avoid having the custom plugins if the browser source maps
 * are emitted.
 */
class MiddlewareSourceMapsPlugin {
  apply(compiler: webpack5.Compiler): void {
    const PLUGIN_NAME = 'NextJsMiddlewareSourceMapsPlugin'
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.buildModule.tap(PLUGIN_NAME, (module) => {
        module.useSourceMap = module.layer === 'middleware'
      })
    })
  }
}
