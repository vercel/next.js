
// watch and trigger file remove event
// see: https://github.com/webpack/webpack/issues/1533

export default class WatchRemoveEventPlugin {
  constructor () {
    this.removedFiles = []
  }

  apply (compiler) {
    compiler.removedFiles = []

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
      watchpack.on('remove', (file) => {
        this.removedFiles.push(file)
      })
      return result
    }
  }
}
