import { resolve, join } from 'path'

export default class WatchPagesPlugin {
  constructor (dir) {
    this.dir = resolve(dir, 'pages')
  }

  apply (compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      // watch the pages directory
      compilation.contextDependencies = [
        ...compilation.contextDependencies,
        this.dir
      ]
      callback()
    })
  }
}
