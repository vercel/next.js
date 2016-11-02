import { resolve, relative, join, extname } from 'path'

export default class WatchPagesPlugin {
  constructor (dir) {
    this.dir = resolve(dir, 'pages')
    this.prevFileDependencies = null
  }

  apply (compiler) {
    compiler.plugin('emit', (compilation, callback) => {
      // watch the pages directory
      compilation.contextDependencies =
        compilation.contextDependencies.concat([this.dir])

      this.prevFileDependencies = compilation.fileDependencies

      callback()
    })

    const isPageFile = this.isPageFile.bind(this)
    const getEntryName = (f) => {
      return join('bundles', relative(compiler.options.context, f))
    }
    const errorPageName = join('bundles', 'pages', '_error.js')

    compiler.plugin('watch-run', (watching, callback) => {
      Object.keys(compiler.fileTimestamps)
      .filter(isPageFile)
      .filter((f) => this.prevFileDependencies.indexOf(f) < 0)
      .forEach((f) => {
        const name = getEntryName(f)
        if (name === errorPageName) {
          compiler.removeEntry(name)
        }

        if (compiler.hasEntry(name)) return

        const entries = ['webpack/hot/dev-server', f]
        compiler.addEntry(entries, name)
      })

      compiler.removedFiles
      .filter(isPageFile)
      .forEach((f) => {
        const name = getEntryName(f)
        compiler.removeEntry(name)

        if (name === errorPageName) {
          compiler.addEntry([
            'webpack/hot/dev-server',
            join(__dirname, '..', '..', '..', 'pages', '_error.js')
          ], name)
        }
      })

      callback()
    })
  }

  isPageFile (f) {
    return f.indexOf(this.dir) === 0 && extname(f) === '.js'
  }
}

