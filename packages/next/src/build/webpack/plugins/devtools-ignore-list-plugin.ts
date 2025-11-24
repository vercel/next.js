// Source: https://github.com/mondaychen/devtools-ignore-webpack-plugin/blob/e35ce41d9606a92a455ef247f509a1c2ccab5778/src/index.ts

import { webpack } from 'next/dist/compiled/webpack/webpack'

// Following the naming conventions from
// https://tc39.es/source-map/#source-map-format
const IGNORE_LIST = 'ignoreList'

const PLUGIN_NAME = 'devtools-ignore-plugin'

interface SourceMap {
  sources: string[]
  [IGNORE_LIST]: number[]
}

interface PluginOptions {
  shouldIgnorePath?: (path: string) => boolean
  isSourceMapAsset?: (name: string) => boolean
}

interface ValidatedOptions extends PluginOptions {
  shouldIgnorePath: Required<PluginOptions>['shouldIgnorePath']
  isSourceMapAsset: Required<PluginOptions>['isSourceMapAsset']
}

function defaultShouldIgnorePath(path: string): boolean {
  return path.includes('/node_modules/') || path.includes('/webpack/')
}

function defaultIsSourceMapAsset(name: string): boolean {
  return name.endsWith('.map')
}

function isWebpackRuntimeModule(modulePath: string): boolean {
  // webpack:///webpack/bootstrap
  // webpack://_N_E/webpack/
  // webpack://someOtherLibrary/webpack/
  return /^webpack:\/\/([^/]*)\/webpack/.test(modulePath)
}

/**
 * This plugin adds a field to source maps that identifies which sources are
 * vendored or runtime-injected (aka third-party) sources. These are consumed by
 * Chrome DevTools to automatically ignore-list sources.
 */
export default class DevToolsIgnorePlugin {
  options: ValidatedOptions

  constructor(options: PluginOptions = {}) {
    this.options = {
      shouldIgnorePath: options.shouldIgnorePath ?? defaultShouldIgnorePath,
      isSourceMapAsset: options.isSourceMapAsset ?? defaultIsSourceMapAsset,
    }
  }

  apply(compiler: webpack.Compiler) {
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

            const sourcemap = JSON.parse(mapContent) as SourceMap

            const ignoreList = []
            for (const [index, path] of sourcemap.sources.entries()) {
              if (this.options.shouldIgnorePath(path)) {
                ignoreList.push(index)
              } else if (isWebpackRuntimeModule(path)) {
                // Just like our EvalSourceMapDevToolPlugin ignore-lists Webpack
                // runtime by default, we do the same here.
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
