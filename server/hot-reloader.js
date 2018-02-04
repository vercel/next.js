import { join, relative, sep } from 'path'
import WebpackDevMiddleware from 'webpack-dev-middleware'
import WebpackHotMiddleware from 'webpack-hot-middleware'
import onDemandEntryHandler from './on-demand-entry-handler'
import webpack from 'webpack'
import getBaseWebpackConfig from './build/webpack'
import clean from './build/clean'
import getConfig from './config'
import UUID from 'uuid'
import {
  IS_BUNDLED_PAGE,
  addCorsSupport
} from './utils'

export default class HotReloader {
  constructor (dir, { quiet, conf } = {}) {
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
    // Here buildId could be any value.
    // Our router accepts any value in the dev mode.
    // But for the webpack-compiler and for the webpack-dev-server
    // it should be the same value.
    this.buildId = UUID.v4()

    this.config = getConfig(dir, conf)
  }

  async run (req, res) {
    // Usually CORS support is not needed for the hot-reloader (this is dev only feature)
    // With when the app runs for multi-zones support behind a proxy,
    // the current page is trying to access this URL via assetPrefix.
    // That's when the CORS support is needed.
    const { preflight } = addCorsSupport(req, res)
    if (preflight) {
      return
    }

    for (const fn of this.middlewares) {
      await new Promise((resolve, reject) => {
        fn(req, res, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    }
  }

  async start () {
    await clean(this.dir)

    const configs = await Promise.all([
      getBaseWebpackConfig(this.dir, { dev: true, isServer: false, config: this.config }),
      getBaseWebpackConfig(this.dir, { dev: true, isServer: true, config: this.config })
    ])

    const compiler = webpack(configs)

    const buildTools = await this.prepareBuildTools(compiler)
    this.assignBuildTools(buildTools)

    this.stats = (await this.waitUntilValid()).stats[0]
  }

  async stop (webpackDevMiddleware) {
    const middleware = webpackDevMiddleware || this.webpackDevMiddleware
    if (middleware) {
      return new Promise((resolve, reject) => {
        middleware.close((err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    }
  }

  async reload () {
    this.stats = null

    await clean(this.dir)

    const configs = await Promise.all([
      getBaseWebpackConfig(this.dir, { dev: true, isServer: false, config: this.config }),
      getBaseWebpackConfig(this.dir, { dev: true, isServer: true, config: this.config })
    ])

    const compiler = webpack(configs)

    const buildTools = await this.prepareBuildTools(compiler)
    this.stats = await this.waitUntilValid(buildTools.webpackDevMiddleware)

    const oldWebpackDevMiddleware = this.webpackDevMiddleware

    this.assignBuildTools(buildTools)
    await this.stop(oldWebpackDevMiddleware)
  }

  assignBuildTools ({ webpackDevMiddleware, webpackHotMiddleware, onDemandEntries }) {
    this.webpackDevMiddleware = webpackDevMiddleware
    this.webpackHotMiddleware = webpackHotMiddleware
    this.onDemandEntries = onDemandEntries
    this.middlewares = [
      webpackDevMiddleware,
      webpackHotMiddleware,
      onDemandEntries.middleware()
    ]
  }

  async prepareBuildTools (compiler) {
    // This flushes require.cache after emitting the files. Providing 'hot reloading' of server files.
    compiler.compilers.forEach((singleCompiler) => {
      singleCompiler.plugin('after-emit', (compilation, callback) => {
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
    })

    compiler.compilers[0].plugin('done', (stats) => {
      const { compilation } = stats
      const chunkNames = new Set(
        compilation.chunks
          .map((c) => c.name)
          .filter(name => IS_BUNDLED_PAGE.test(name))
      )

      const failedChunkNames = new Set(compilation.errors
      .map((e) => e.module.reasons)
      .reduce((a, b) => a.concat(b), [])
      .map((r) => r.module.chunks)
      .reduce((a, b) => a.concat(b), [])
      .map((c) => c.name))

      const chunkHashes = new Map(
        compilation.chunks
          .filter(c => IS_BUNDLED_PAGE.test(c.name))
          .map((c) => [c.name, c.hash])
      )

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

    const ignored = [
      /(^|[/\\])\../, // .dotfiles
      /node_modules/
    ]

    let webpackDevMiddlewareConfig = {
      publicPath: `/_next/webpack/`,
      noInfo: true,
      quiet: true,
      clientLogLevel: 'warning',
      watchOptions: { ignored }
    }

    if (this.config.webpackDevMiddleware) {
      console.log(`> Using "webpackDevMiddleware" config function defined in ${this.config.configOrigin}.`)
      webpackDevMiddlewareConfig = this.config.webpackDevMiddleware(webpackDevMiddlewareConfig)
    }

    const webpackDevMiddleware = WebpackDevMiddleware(compiler, webpackDevMiddlewareConfig)

    const webpackHotMiddleware = WebpackHotMiddleware(compiler.compilers[0], {
      path: '/_next/webpack-hmr',
      log: false,
      heartbeat: 2500
    })

    const onDemandEntries = onDemandEntryHandler(webpackDevMiddleware, compiler.compilers, {
      dir: this.dir,
      dev: true,
      reload: this.reload.bind(this),
      ...this.config.onDemandEntries
    })

    return {
      webpackDevMiddleware,
      webpackHotMiddleware,
      onDemandEntries
    }
  }

  waitUntilValid (webpackDevMiddleware) {
    const middleware = webpackDevMiddleware || this.webpackDevMiddleware
    return new Promise((resolve) => {
      middleware.waitUntilValid(resolve)
    })
  }

  async getCompilationErrors () {
    // When we are reloading, we need to wait until it's reloaded properly.
    await this.onDemandEntries.waitUntilReloaded()

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

  async ensurePage (page) {
    await this.onDemandEntries.ensurePage(page)
  }
}

function deleteCache (path) {
  delete require.cache[path]
}

function diff (a, b) {
  return new Set([...a].filter((v) => !b.has(v)))
}

function toRoute (file) {
  const f = sep === '\\' ? file.replace(/\\/g, '/') : file
  return ('/' + f).replace(/(\/index)?\.js$/, '') || '/'
}
