import { Compiler, Plugin, version } from 'webpack'
import { realpathSync } from 'fs'

const isWebpack5 = parseInt(version!) === 5

function deleteCache(path: string) {
  try {
    delete require.cache[realpathSync(path)]
  } catch (e) {
    if (e.code !== 'ENOENT') throw e
  } finally {
    delete require.cache[path]
  }
}

const PLUGIN_NAME = 'NextJsRequireCacheHotReloader'

// This plugin flushes require.cache after emitting the files. Providing 'hot reloading' of server files.
export class NextJsRequireCacheHotReloader implements Plugin {
  prevAssets: any = null
  previousOutputPathsWebpack5: Set<string> = new Set()
  currentOutputPathsWebpack5: Set<string> = new Set()

  apply(compiler: Compiler) {
    if (isWebpack5) {
      // @ts-ignored Webpack has this hooks
      compiler.hooks.assetEmitted.tap(
        PLUGIN_NAME,
        (_file: any, { targetPath }: any) => {
          this.currentOutputPathsWebpack5.add(targetPath)
          deleteCache(targetPath)
        }
      )

      compiler.hooks.afterEmit.tap(PLUGIN_NAME, () => {
        for (const path of this.previousOutputPathsWebpack5) {
          if (!this.currentOutputPathsWebpack5.has(path)) {
            deleteCache(path)
          }
        }

        this.previousOutputPathsWebpack5 = new Set(
          this.currentOutputPathsWebpack5
        )
        this.currentOutputPathsWebpack5.clear()
      })
      return
    }

    compiler.hooks.afterEmit.tapAsync(PLUGIN_NAME, (compilation, callback) => {
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
    })
  }
}
