import { Compiler, Plugin } from 'next/dist/compiled/webpack.js'
import { realpathSync } from 'fs'

function deleteCache(path: string) {
  try {
    delete require.cache[realpathSync(path)]
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  } finally {
    delete require.cache[path]
  }
}

// This plugin flushes require.cache after emitting the files. Providing 'hot reloading' of server files.
export class NextJsRequireCacheHotReloader implements Plugin {
  prevAssets: any = null

  apply(compiler: Compiler) {
    compiler.hooks.afterEmit.tapAsync(
      'NextJsRequireCacheHotReloader',
      (compilation, callback) => {
        const { assets } = compilation

        if (this.prevAssets) {
          for (const f of Object.keys(assets)) {
            deleteCache(assets[f].existsAt)
          }
          for (const f of Object.keys(this.prevAssets)) {
            if (!assets[f]) {
              deleteCache(this.prevAssets[f].existsAt)
            }
          }
        }
        this.prevAssets = assets

        callback()
      }
    )
  }
}
