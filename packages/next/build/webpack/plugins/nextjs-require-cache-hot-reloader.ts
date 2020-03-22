import { Compiler, Plugin } from 'webpack'
import { realpathSync } from 'fs'
import path from 'path'
const webpack5Experiential = parseInt(require('webpack').version) === 5

function deleteCache(path: string) {
  try {
    if (!webpack5Experiential) delete require.cache[realpathSync(path)]
    if (webpack5Experiential) delete require.cache[path]
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
        const { assets, outputOptions } = compilation
        const outputPath = outputOptions.path

        // if (!assets['build-manifest.json'] && webpack5Experiential) {
        //   deleteCache(path.resolve(outputPath, '../', 'build-manifest.json'))
        // }

        if (this.prevAssets) {
          for (const f of Object.keys(assets)) {
            if (webpack5Experiential) {
              deleteCache(path.resolve(outputPath, f))
            } else {
              deleteCache(assets[f].existsAt)
            }
          }
          for (const f of Object.keys(this.prevAssets)) {
            if (!assets[f]) {
              if (webpack5Experiential) {
                deleteCache(path.resolve(outputPath, f))
              } else {
                deleteCache(this.prevAssets[f].existsAt)
              }
            }
          }
        }
        this.prevAssets = assets

        callback()
      }
    )
  }
}
