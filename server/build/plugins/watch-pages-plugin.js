import { join } from 'path'
import getConfig from '../../config'

export default class WatchPagesPlugin {
  constructor (dir) {
    this.config = getConfig(dir)
  }

  apply (compiler) {
    compiler.plugin('compilation', (compilation) => {
      compilation.plugin('optimize-assets', (assets, callback) => {
        // transpile pages/_document.js and descendants,
        // but don't need the bundle file
        delete assets[join('bundles', this.config.pagesDirectory, '_document.js')]
        callback()
      })
    })

    compiler.plugin('emit', (compilation, callback) => {
      // watch the pages directory
      compilation.contextDependencies = [
        ...compilation.contextDependencies,
        this.config.pagesDirectory
      ]
      callback()
    })
  }
}
