import { webpack } from 'next/dist/compiled/webpack/webpack'
import { MIDDLEWARE_LOCATION_REGEXP } from '../../../lib/constants'
import type { webpack5 } from 'next/dist/compiled/webpack/webpack'

/**
 * Produce source maps for middlewares.
 * Currently we use the same compiler for browser and middlewares,
 */
export const getMiddlewareSourceMapPlugins = () => {
  return [
    new webpack.SourceMapDevToolPlugin({
      filename: '[file].map',
      include: [
        new RegExp(`^${MIDDLEWARE_LOCATION_REGEXP}\\.`),
        /^edge-chunks\//,
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
