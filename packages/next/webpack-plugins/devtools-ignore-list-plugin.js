// Source: https://github.com/mondaychen/devtools-ignore-webpack-plugin/blob/e35ce41d9606a92a455ef247f509a1c2ccab5778/src/index.ts

// eslint-disable-next-line import/no-extraneous-dependencies -- this is a dev-only file
const webpack = require('webpack')

// Following the naming conventions from
// https://tc39.es/source-map/#source-map-format
const IGNORE_LIST = 'ignoreList'
const PLUGIN_NAME = 'devtools-ignore-plugin'
function defaultShouldIgnorePath(path) {
  return path.includes('/node_modules/') || path.includes('/webpack/')
}
function defaultIsSourceMapAsset(name) {
  return name.endsWith('.map')
}

/**
 * This plugin adds a field to source maps that identifies which sources are
 * vendored or runtime-injected (aka third-party) sources. These are consumed by
 * Chrome DevTools to automatically ignore-list sources.
 */
module.exports = class DevToolsIgnorePlugin {
  options
  constructor(options = {}) {
    this.options = {
      shouldIgnorePath: options.shouldIgnorePath ?? defaultShouldIgnorePath,
      isSourceMapAsset: options.isSourceMapAsset ?? defaultIsSourceMapAsset,
    }
  }
  apply(compiler) {
    const { RawSource } = compiler.webpack.sources
    compiler.hooks.compilation.tap(PLUGIN_NAME, (compilation) => {
      compilation.hooks.processAssets.tap(
        {
          name: PLUGIN_NAME,
          stage: webpack.Compilation.PROCESS_ASSETS_STAGE_DEV_TOOLING,
          additionalAssets: true,
        },
        (assets) => {
          for (const [name, asset] of Object.entries(assets)) {
            // Instead of using `asset.map()` to fetch the source maps from
            // SourceMapSource assets, process them directly as a RawSource.
            // This is because `.map()` is slow and can take several seconds.
            if (!this.options.isSourceMapAsset(name)) {
              // Ignore non source map files.
              continue
            }
            const mapContent = asset.source().toString()
            if (!mapContent) {
              continue
            }
            const sourcemap = JSON.parse(mapContent)
            const ignoreList = []
            for (const [index, path] of sourcemap.sources.entries()) {
              if (this.options.shouldIgnorePath(path)) {
                ignoreList.push(index)
              }
            }
            sourcemap[IGNORE_LIST] = ignoreList
            compilation.updateAsset(
              name,
              new RawSource(JSON.stringify(sourcemap))
            )
          }
        }
      )
    })
  }
}
