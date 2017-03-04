import { resolve, join } from 'path'

export default class WatchPagesPlugin {
  constructor (dir) {
    this.dir = resolve(dir, 'pages')
  }

  apply (compiler) {
    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('optimize-assets', (assets, callback) => {
        // transpile pages/_document.js and descendants,
        // but don't need the bundle file
        delete assets[join('bundles', 'pages', '_document.js')]
        callback()
      })
    })

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
