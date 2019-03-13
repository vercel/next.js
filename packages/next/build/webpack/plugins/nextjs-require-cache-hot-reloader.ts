import { Compiler, Plugin } from 'webpack'
import { access as accessMod, realpath as realpathMod } from 'fs'
import { promisify } from 'util'

const access = promisify(accessMod)
const realpath = promisify(realpathMod)

function deleteCache (path: string) {
  access(path).then(() => realpath(path).then((p) => {
    delete require.cache[p]
    delete require.cache[path]
  })).catch(() => {
    delete require.cache[path]
  })
}

// This plugin flushes require.cache after emitting the files. Providing 'hot reloading' of server files.
export class NextJsRequireCacheHotReloader implements Plugin {
  prevAssets: any = null

  apply (compiler: Compiler) {
    compiler.hooks.afterEmit.tapAsync('NextJsRequireCacheHotReloader', (compilation, callback) => {
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
