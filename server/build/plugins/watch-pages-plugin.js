import { resolve, relative, join, extname } from 'path'

export default class WatchPagesPlugin {
  constructor (dir) {
    this.dir = resolve(dir, 'pages')
  }

  apply (compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      // watch the pages directory
      compilation.contextDependencies =
        compilation.contextDependencies.concat([this.dir])

      callback()
    })

    const isPageFile = this.isPageFile.bind(this)
    const getEntryName = (f) => {
      return join('bundles', relative(compiler.options.context, f))
    }

    compiler.plugin('watch-run', (watching, callback) => {
      Object.keys(compiler.fileTimestamps)
      .filter(isPageFile)
      .forEach((f) => {
        const name = getEntryName(f)
        if (compiler.hasEntry(name)) return

        const entries = ['webpack/hot/only-dev-server', f]
        compiler.addEntry(entries, name)
      })

      compiler.removedFiles
      .filter(isPageFile)
      .forEach((f) => {
        const name = getEntryName(f)
        compiler.removeEntry(name)
      })

      callback()
    })
  }

  isPageFile (f) {
    return f.indexOf(this.dir) === 0 && extname(f) === '.js'
  }
}

