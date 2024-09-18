import type { webpack } from 'next/dist/compiled/webpack/webpack'
import { deleteCache } from '../../../server/dev/require-cache'
import { clearModuleContext } from '../../../server/web/sandbox'
import path from 'path'

type Compiler = webpack.Compiler
type WebpackPluginInstance = webpack.WebpackPluginInstance

const RUNTIME_NAMES = ['webpack-runtime', 'webpack-api-runtime']
const PLUGIN_NAME = 'NextJsRequireCacheHotReloader'

// This plugin flushes require.cache after emitting the files. Providing 'hot reloading' of server files.
export class NextJsRequireCacheHotReloader implements WebpackPluginInstance {
  prevAssets: any = null
  serverComponents: boolean

  constructor(opts: { serverComponents: boolean }) {
    this.serverComponents = opts.serverComponents
  }

  apply(compiler: Compiler) {
    compiler.hooks.assetEmitted.tap(PLUGIN_NAME, (_file, { targetPath }) => {
      // Clear module context in this process
      clearModuleContext(targetPath)
      deleteCache(targetPath)
    })

    compiler.hooks.afterEmit.tapPromise(PLUGIN_NAME, async (compilation) => {
      for (const name of RUNTIME_NAMES) {
        const runtimeChunkPath = path.join(
          compilation.outputOptions.path!,
          `${name}.js`
        )
        deleteCache(runtimeChunkPath)
      }

      // we need to make sure to clear all server entries from cache
      // since they can have a stale webpack-runtime cache
      // which needs to always be in-sync
      const entries = [...compilation.entries.keys()].filter((entry) => {
        const isAppPath = entry.toString().startsWith('app/')
        return entry.toString().startsWith('pages/') || isAppPath
      })

      for (const page of entries) {
        const outputPath = path.join(
          compilation.outputOptions.path!,
          page + '.js'
        )
        deleteCache(outputPath)
      }
    })
  }
}
