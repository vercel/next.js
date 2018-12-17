import { join, relative, sep, normalize } from 'path'
import WebpackDevMiddleware from 'webpack-dev-middleware'
import WebpackHotMiddleware from 'webpack-hot-middleware'
import errorOverlayMiddleware from './lib/error-overlay-middleware'
import del from 'del'
import onDemandEntryHandler, {normalizePage} from './on-demand-entry-handler'
import webpack from 'webpack'
import WebSocket from 'ws'
import getBaseWebpackConfig from '../build/webpack-config'
import {IS_BUNDLED_PAGE_REGEX, ROUTE_NAME_REGEX, BLOCKED_PAGES, CLIENT_STATIC_FILES_PATH} from 'next-server/constants'
import {route} from 'next-server/dist/server/router'

export async function renderScriptError (res, error) {
  // Asks CDNs and others to not to cache the errored page
  res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate')

  if (error.code === 'ENOENT' || error.message === 'INVALID_BUILD_ID') {
    res.statusCode = 404
    res.end('404 - Not Found')
    return
  }

  console.error(error.stack)
  res.statusCode = 500
  res.end('500 - Internal Error')
}

function addCorsSupport (req, res) {
  if (!req.headers.origin) {
    return { preflight: false }
  }

  res.setHeader('Access-Control-Allow-Origin', req.headers.origin)
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET')
  // Based on https://github.com/primus/access-control/blob/4cf1bc0e54b086c91e6aa44fb14966fa5ef7549c/index.js#L158
  if (req.headers['access-control-request-headers']) {
    res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'])
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(200)
    res.end()
    return { preflight: true }
  }

  return { preflight: false }
}

const matchNextPageBundleRequest = route('/_next/static/:buildId/pages/:path*.js(.map)?')

// Recursively look up the issuer till it ends up at the root
function findEntryModule (issuer) {
  if (issuer.issuer) {
    return findEntryModule(issuer.issuer)
  }

  return issuer
}

function erroredPages (compilation, options = {enhanceName: (name) => name}) {
  const failedPages = {}
  for (const error of compilation.errors) {
    const entryModule = findEntryModule(error.origin)
    const {name} = entryModule
    if (!name) {
      continue
    }

    // Only pages have to be reloaded
    if (!IS_BUNDLED_PAGE_REGEX.test(name)) {
      continue
    }

    const enhancedName = options.enhanceName(name)

    if (!failedPages[enhancedName]) {
      failedPages[enhancedName] = []
    }

    failedPages[enhancedName].push(error)
  }

  return failedPages
}

export default class HotReloader {
  constructor (dir, { config, buildId } = {}) {
    this.buildId = buildId
    this.dir = dir
    this.middlewares = []
    this.webpackDevMiddleware = null
    this.webpackHotMiddleware = null
    this.initialized = false
    this.stats = null
    this.compilationErrors = null
    this.prevChunkNames = null
    this.prevFailedChunkNames = null
    this.prevChunkHashes = null
    this.serverPrevDocumentHash = null

    this.config = config
  }

  async run (req, res, parsedUrl) {
    // Usually CORS support is not needed for the hot-reloader (this is dev only feature)
    // With when the app runs for multi-zones support behind a proxy,
    // the current page is trying to access this URL via assetPrefix.
    // That's when the CORS support is needed.
    const { preflight } = addCorsSupport(req, res)
    if (preflight) {
      return
    }

    // When a request comes in that is a page bundle, e.g. /_next/static/<buildid>/pages/index.js
    // we have to compile the page using on-demand-entries, this middleware will handle doing that
    // by adding the page to on-demand-entries, waiting till it's done
    // and then the bundle will be served like usual by the actual route in server/index.js
    const handlePageBundleRequest = async (req, res, parsedUrl) => {
      const {pathname} = parsedUrl
      const params = matchNextPageBundleRequest(pathname)
      if (!params) {
        return {}
      }

      if (params.buildId !== this.buildId) {
        return
      }

      const page = `/${params.path.join('/')}`
      if (BLOCKED_PAGES.indexOf(page) === -1) {
        try {
          await this.ensurePage(page)
        } catch (error) {
          await renderScriptError(res, error)
          return {finished: true}
        }

        const errors = await this.getCompilationErrors(page)
        if (errors.length > 0) {
          await renderScriptError(res, errors[0])
          return {finished: true}
        }
      }

      return {}
    }

    const {finished} = await handlePageBundleRequest(req, res, parsedUrl)

    for (const fn of this.middlewares) {
      await new Promise((resolve, reject) => {
        fn(req, res, (err) => {
          if (err) return reject(err)
          resolve()
        })
      })
    }

    return {finished}
  }

  async clean () {
    return del(join(this.dir, this.config.distDir), { force: true })
  }

  addWsPort (configs) {
    configs[0].plugins.push(new webpack.DefinePlugin({
      'process.env.NEXT_WS_PORT': this.wsPort
    }))
  }

  async start () {
    await this.clean()

    this.wsPort = await new Promise((resolve, reject) => {
      // create dynamic entries WebSocket
      this.wss = new WebSocket.Server({ port: 0 }, function (err) {
        if (err) {
          return reject(err)
        }

        const {port} = this.address()
        if (!port) {
          return reject(new Error('No websocket port could be detected'))
        }
        resolve(port)
      })
    })

    const configs = await Promise.all([
      getBaseWebpackConfig(this.dir, { dev: true, isServer: false, config: this.config, buildId: this.buildId }),
      getBaseWebpackConfig(this.dir, { dev: true, isServer: true, config: this.config, buildId: this.buildId })
    ])
    this.addWsPort(configs)

    const multiCompiler = webpack(configs)

    const buildTools = await this.prepareBuildTools(multiCompiler)
    this.assignBuildTools(buildTools)

    this.stats = (await this.waitUntilValid()).stats[0]
  }

  async stop (webpackDevMiddleware) {
    this.wss.close()
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

    await this.clean()

    const configs = await Promise.all([
      getBaseWebpackConfig(this.dir, { dev: true, isServer: false, config: this.config, buildId: this.buildId }),
      getBaseWebpackConfig(this.dir, { dev: true, isServer: true, config: this.config, buildId: this.buildId })
    ])
    this.addWsPort(configs)

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
    this.wss.on('connection', this.onDemandEntries.wsConnection)
    this.middlewares = [
      webpackDevMiddleware,
      webpackHotMiddleware,
      errorOverlayMiddleware,
      onDemandEntries.middleware()
    ]
  }

  async prepareBuildTools (multiCompiler) {
    // This plugin watches for changes to _document.js and notifies the client side that it should reload the page
    multiCompiler.compilers[1].hooks.done.tap('NextjsHotReloaderForServer', (stats) => {
      if (!this.initialized) {
        return
      }

      const {compilation} = stats

      // We only watch `_document` for changes on the server compilation
      // the rest of the files will be triggered by the client compilation
      const documentChunk = compilation.chunks.find(c => c.name === normalize(`static/${this.buildId}/pages/_document.js`))
      // If the document chunk can't be found we do nothing
      if (!documentChunk) {
        console.warn('_document.js chunk not found')
        return
      }

      // Initial value
      if (this.serverPrevDocumentHash === null) {
        this.serverPrevDocumentHash = documentChunk.hash
        return
      }

      // If _document.js didn't change we don't trigger a reload
      if (documentChunk.hash === this.serverPrevDocumentHash) {
        return
      }

      // Notify reload to reload the page, as _document.js was changed (different hash)
      this.send('reload', '/_document')

      this.serverPrevDocumentHash = documentChunk.hash
    })

    multiCompiler.compilers[0].hooks.done.tap('NextjsHotReloaderForClient', (stats) => {
      const { compilation } = stats
      const chunkNames = new Set(
        compilation.chunks
          .map((c) => c.name)
          .filter(name => IS_BUNDLED_PAGE_REGEX.test(name))
      )

      const failedChunkNames = new Set(Object.keys(erroredPages(compilation)))

      const chunkHashes = new Map(
        compilation.chunks
          .filter(c => IS_BUNDLED_PAGE_REGEX.test(c.name))
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

        const rootDir = join(CLIENT_STATIC_FILES_PATH, this.buildId, 'pages')

        for (const n of new Set([...added, ...succeeded, ...removed, ...failed])) {
          const route = toRoute(relative(rootDir, n))
          this.send('reload', route)
        }

        let changedPageRoutes = []

        for (const [n, hash] of chunkHashes) {
          if (!this.prevChunkHashes.has(n)) continue
          if (this.prevChunkHashes.get(n) === hash) continue

          const route = toRoute(relative(rootDir, n))

          changedPageRoutes.push(route)
        }

        // This means `/_app` is most likely included in the list, or a page was added/deleted in this compilation run.
        // This means we should filter out `/_app` because `/_app` will be re-rendered with the page reload.
        if (added.size !== 0 || removed.size !== 0 || changedPageRoutes.length > 1) {
          changedPageRoutes = changedPageRoutes.filter((route) => route !== '/_app' && route !== '/_document')
        }

        for (const changedPageRoute of changedPageRoutes) {
          // notify change to recover from runtime errors
          this.send('change', changedPageRoute)
        }
      }

      this.initialized = true
      this.stats = stats
      this.compilationErrors = null
      this.prevChunkNames = chunkNames
      this.prevFailedChunkNames = failedChunkNames
      this.prevChunkHashes = chunkHashes
    })

    // We don’t watch .git/ .next/ and node_modules for changes
    const ignored = [
      /[\\/]\.git[\\/]/,
      /[\\/]\.next[\\/]/,
      /[\\/]node_modules[\\/]/
    ]

    let webpackDevMiddlewareConfig = {
      publicPath: `/_next/static/webpack`,
      noInfo: true,
      logLevel: 'silent',
      watchOptions: { ignored },
      writeToDisk: true
    }

    if (this.config.webpackDevMiddleware) {
      console.log(`> Using "webpackDevMiddleware" config function defined in ${this.config.configOrigin}.`)
      webpackDevMiddlewareConfig = this.config.webpackDevMiddleware(webpackDevMiddlewareConfig)
    }

    const webpackDevMiddleware = WebpackDevMiddleware(multiCompiler, webpackDevMiddlewareConfig)

    const webpackHotMiddleware = WebpackHotMiddleware(multiCompiler.compilers[0], {
      path: '/_next/webpack-hmr',
      log: false,
      heartbeat: 2500
    })

    const onDemandEntries = onDemandEntryHandler(webpackDevMiddleware, multiCompiler, {
      dir: this.dir,
      buildId: this.buildId,
      dev: true,
      reload: this.reload.bind(this),
      pageExtensions: this.config.pageExtensions,
      wsPort: this.wsPort,
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

  async getCompilationErrors (page) {
    const normalizedPage = normalizePage(page)
    // When we are reloading, we need to wait until it's reloaded properly.
    await this.onDemandEntries.waitUntilReloaded()

    if (this.stats.hasErrors()) {
      const {compilation} = this.stats
      const failedPages = erroredPages(compilation, {
        enhanceName (name) {
          return '/' + ROUTE_NAME_REGEX.exec(name)[1]
        }
      })

      // If there is an error related to the requesting page we display it instead of the first error
      if (failedPages[normalizedPage] && failedPages[normalizedPage].length > 0) {
        return failedPages[normalizedPage]
      }

      // If none were found we still have to show the other errors
      return this.stats.compilation.errors
    }

    return []
  }

  send (action, ...args) {
    this.webpackHotMiddleware.publish({ action, data: args })
  }

  async ensurePage (page) {
    // Make sure we don't re-build or dispose prebuilt pages
    if (page === '/_error' || page === '/_document' || page === '/_app') {
      return
    }
    await this.onDemandEntries.ensurePage(page)
  }
}

function diff (a, b) {
  return new Set([...a].filter((v) => !b.has(v)))
}

function toRoute (file) {
  const f = sep === '\\' ? file.replace(/\\/g, '/') : file
  return ('/' + f).replace(/(\/index)?\.js$/, '') || '/'
}
