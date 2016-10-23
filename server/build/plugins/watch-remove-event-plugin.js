
// watch and trigger file remove event
// see: https://github.com/webpack/webpack/issues/1533

export default class WatchRemoveEventPlugin {
  constructor () {
    this.removedFiles = []
  }

  apply (compiler) {
    compiler.removedFiles = []

    compiler.plugin('environment', () => {
      if (!compiler.watchFileSystem) return

      const { watchFileSystem } = compiler
      const { watch } = watchFileSystem

      watchFileSystem.watch = (files, dirs, missing, startTime, options, callback, callbackUndelayed) => {
        const result = watch.call(watchFileSystem, files, dirs, missing, startTime, options, (...args) => {
          compiler.removedFiles = this.removedFiles
          this.removedFiles = []
          callback(...args)
        }, callbackUndelayed)

        const watchpack = watchFileSystem.watcher
        watchpack.fileWatchers.forEach((w) => {
          w.on('remove', this.onRemove.bind(this, watchpack, w.path))
        })
        return result
      }
    })
  }

  onRemove (watchpack, file) {
    this.removedFiles.push(file)
    watchpack.emit('remove', file)
    watchpack._onChange(file)
  }
}
