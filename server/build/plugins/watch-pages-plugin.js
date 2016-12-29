import { resolve, relative, join, extname } from 'path'

const hotMiddlewareClientPath = join(__dirname, '..', '..', '..', 'client/webpack-hot-middleware-client')

const defaultPages = new Map()
for (const p of ['_error.js', '_document.js']) {
  defaultPages.set(
    join('bundles', 'pages', p),
    join(__dirname, '..', '..', '..', 'pages', p)
  )
}

export default class WatchPagesPlugin {
  constructor (dir) {
    this.dir = resolve(dir, 'pages')
    this.prevFileDependencies = []
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
      compilation.contextDependencies =
        compilation.contextDependencies.concat([this.dir])

      this.prevFileDependencies = compilation.fileDependencies

      callback()
    })

    const isPageFile = this.isPageFile.bind(this)
    const getEntryName = (f) => {
      return join('bundles', relative(compiler.options.context, f))
    }

    compiler.plugin('watch-run', (watching, callback) => {
      Object.keys(compiler.fileTimestamps)
      .filter(isPageFile)
      .filter((f) => this.prevFileDependencies.indexOf(f) < 0)
      .forEach((f) => {
        const name = getEntryName(f)
        if (defaultPages.has(name)) {
          compiler.removeEntry(name)
        }

        if (compiler.hasEntry(name)) return

        const entries = [hotMiddlewareClientPath, f]
        compiler.addEntry(entries, name)
      })

      compiler.removedFiles
      .filter(isPageFile)
      .forEach((f) => {
        const name = getEntryName(f)
        compiler.removeEntry(name)

        if (defaultPages.has(name)) {
          compiler.addEntry([
            hotMiddlewareClientPath,
            defaultPages.get(name)
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

