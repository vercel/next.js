import { join, relative, sep } from 'path'
import WebpackDevServer from 'webpack-dev-server'
import webpack from './build/webpack'
import read from './read'

export default class HotReloader {
  constructor (dir, dev = false) {
    this.dir = dir
    this.dev = dev
    this.server = null
    this.initialized = false
    this.stats = null
    this.compilationErrors = null
    this.prevAssets = null
    this.prevChunkNames = null
    this.prevFailedChunkNames = null
  }

  async start () {
    await this.prepareServer()
    this.stats = await this.waitUntilValid()
    await this.listen()
  }

  async prepareServer () {
    const compiler = await webpack(this.dir, { hotReload: true, dev: this.dev })

    compiler.plugin('after-emit', (compilation, callback) => {
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

    compiler.plugin('done', (stats) => {
      const { compilation } = stats
      const chunkNames = new Set(compilation.chunks.map((c) => c.name))
      const failedChunkNames = new Set(compilation.errors
      .map((e) => e.module.reasons)
      .reduce((a, b) => a.concat(b), [])
      .map((r) => r.module.chunks)
      .reduce((a, b) => a.concat(b), [])
      .map((c) => c.name))

      if (this.initialized) {
        // detect chunks which have to be replaced with a new template
        // e.g, pages/index.js <-> pages/_error.js
        const added = diff(chunkNames, this.prevChunkNames)
        const removed = diff(this.prevChunkNames, chunkNames)
        const succeeded = diff(this.prevFailedChunkNames, failedChunkNames)

        // reload all failed chunks to replace the templace to the error ones,
        // and to update error content
        const failed = failedChunkNames

        const rootDir = join('bundles', 'pages')

        for (const n of new Set([...added, ...removed, ...failed, ...succeeded])) {
          const route = toRoute(relative(rootDir, n))
          this.send('reload', route)
        }
      }

      this.initialized = true
      this.stats = stats
      this.compilationErrors = null
      this.prevChunkNames = chunkNames
      this.prevFailedChunkNames = failedChunkNames
    })

    this.server = new WebpackDevServer(compiler, {
      publicPath: '/',
      hot: true,
      noInfo: true,
      clientLogLevel: 'warning',
      stats: {
        assets: false,
        children: false,
        chunks: false,
        color: false,
        errors: true,
        errorDetails: false,
        hash: false,
        modules: false,
        publicPath: false,
        reasons: false,
        source: false,
        timings: false,
        version: false,
        warnings: false
      }
    })
  }

  waitUntilValid () {
    return new Promise((resolve) => {
      this.server.middleware.waitUntilValid(resolve)
    })
  }

  listen () {
    return new Promise((resolve, reject) => {
      this.server.listen(3030, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  getCompilationErrors () {
    if (!this.compilationErrors) {
      this.compilationErrors = new Map()

      if (this.stats.hasErrors()) {
        const { compiler, errors } = this.stats.compilation

        for (const err of errors) {
          for (const r of err.module.reasons) {
            for (const c of r.module.chunks) {
              // get the path of the bundle file
              const path = join(compiler.outputPath, c.name)
              const errors = this.compilationErrors.get(path) || []
              this.compilationErrors.set(path, errors.concat([err]))
            }
          }
        }
      }
    }

    return this.compilationErrors
  }

  send (type, data) {
    this.server.sockWrite(this.server.sockets, type, data)
  }
}

function deleteCache (path) {
  delete require.cache[path]
  delete read.cache[path]
}

function diff (a, b) {
  return new Set([...a].filter((v) => !b.has(v)))
}

function toRoute (file) {
  const f = sep === '\\' ? file.replace(/\\/g, '/') : file
  return ('/' + f).replace(/(\/index)?\.js$/, '') || '/'
}
