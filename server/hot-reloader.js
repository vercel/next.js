import { join } from 'path'
import WebpackDevServer from 'webpack-dev-server'
import webpack from './build/webpack'
import read from './read'

export default class HotReloader {
  constructor (dir) {
    this.dir = dir
    this.server = null
    this.stats = null
    this.compilationErrors = null
    this.prevAssets = {}
  }

  async start () {
    await this.prepareServer()
    this.stats = await this.waitUntilValid()
    await this.listen()
  }

  async prepareServer () {
    const compiler = await webpack(this.dir, { hotReload: true })

    compiler.plugin('after-emit', (compilation, callback) => {
      const { assets } = compilation
      for (const f of Object.keys(assets)) {
        deleteCache(assets[f].existsAt)
      }
      for (const f of Object.keys(this.prevAssets)) {
        if (!assets[f]) {
          deleteCache(this.prevAssets[f].existsAt)
        }
      }
      this.prevAssets = assets
      callback()
    })

    compiler.plugin('done', (stats) => {
      this.stats = stats
      this.compilationErrors = null
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
        const entries = this.stats.compilation.entries
        .filter((e) => e.context === this.dir)
        .filter((e) => !!e.errors.length || !!e.dependenciesErrors.length)

        for (const e of entries) {
          const path = join(e.context, '.next', e.name)
          const errors = e.errors.concat(e.dependenciesErrors)
          this.compilationErrors.set(path, errors)
        }
      }
    }

    return this.compilationErrors
  }

  get fileSystem () {
    return this.server.middleware.fileSystem
  }
}

function deleteCache (path) {
  delete require.cache[path]
  delete read.cache[path]
}
