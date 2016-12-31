import { join, relative, sep } from 'path'
import webpackDevMiddleware from 'webpack-dev-middleware'
import webpackHotMiddleware from 'webpack-hot-middleware'
import isWindowsBash from 'is-windows-bash'
import webpack from './build/webpack'
import clean from './build/clean'
import readPage from './read-page'

export default class HotReloader {
  constructor (dir, { quiet } = {}) {
    this.dir = dir
    this.quiet = quiet
    this.middlewares = []
    this.webpackDevMiddleware = null
    this.webpackHotMiddleware = null
    this.initialized = false
    this.stats = null
    this.compilationErrors = null
    this.prevAssets = null
    this.prevChunkNames = null
    this.prevFailedChunkNames = null
    this.prevChunkHashes = null
  }

  async run (req, res) {
    for (const fn of this.middlewares) {
      await new Promise((resolve, reject) => {
        fn(req, res, (err) => {
          if (err) reject(err)
          resolve()
        })
      })
    }
  }

  async start () {
    const [compiler] = await Promise.all([
      webpack(this.dir, { dev: true, quiet: this.quiet }),
      clean(this.dir)
    ])

    this.prepareMiddlewares(compiler)
    this.stats = await this.waitUntilValid()
  }

  async stop () {
    if (this.webpackDevMiddleware) {
      return new Promise((resolve, reject) => {
        this.webpackDevMiddleware.close((err) => {
          if (err) reject(err)
          resolve()
        })
      })
    }
  }

  async prepareMiddlewares (compiler) {
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

      const chunkHashes = new Map(compilation.chunks.map((c) => [c.name, c.hash]))

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

        for (const [n, hash] of chunkHashes) {
          if (!this.prevChunkHashes.has(n)) continue
          if (this.prevChunkHashes.get(n) === hash) continue

          const route = toRoute(relative(rootDir, n))

          // notify change to recover from runtime errors
          this.send('change', route)
        }
      }

      this.initialized = true
      this.stats = stats
      this.compilationErrors = null
      this.prevChunkNames = chunkNames
      this.prevFailedChunkNames = failedChunkNames
      this.prevChunkHashes = chunkHashes
    })

    const windowsSettings = isWindowsBash() ? {
      lazy: false,
      watchOptions: {
        aggregateTimeout: 300,
        poll: true
      }
    } : {}

    this.webpackDevMiddleware = webpackDevMiddleware(compiler, {
      publicPath: '/_webpack/',
      noInfo: true,
      quiet: true,
      clientLogLevel: 'warning',
      ...windowsSettings
    })

    this.webpackHotMiddleware = webpackHotMiddleware(compiler, { log: false })

    this.middlewares = [
      this.webpackDevMiddleware,
      this.webpackHotMiddleware
    ]
  }

  waitUntilValid () {
    return new Promise((resolve) => {
      this.webpackDevMiddleware.waitUntilValid(resolve)
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

  send (action, ...args) {
    this.webpackHotMiddleware.publish({ action, data: args })
  }
}

function deleteCache (path) {
  delete require.cache[path]
  delete readPage.cache[path]
}

function diff (a, b) {
  return new Set([...a].filter((v) => !b.has(v)))
}

function toRoute (file) {
  const f = sep === '\\' ? file.replace(/\\/g, '/') : file
  return ('/' + f).replace(/(\/index)?\.js$/, '') || '/'
}
