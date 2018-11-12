// @flow

function deleteCache (path: string) {
  delete require.cache[path]
}

// This plugin flushes require.cache after emitting the files. Providing 'hot reloading' of server files.
export default class NextJsRequireCacheHotReloader {
  prevAssets: null | {[string]: {existsAt: string}}
  constructor () {
    this.prevAssets = null
  }
  apply (compiler: any) {
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
