import { resolve, join, sep } from 'path'
import { parse as parseUrl } from 'url'
import { parse as parseQs } from 'querystring'
import fs from 'fs'
import http, { STATUS_CODES } from 'http'
import {
  renderToHTML,
  renderErrorToHTML,
  sendHTML,
  serveStatic,
  renderScript,
  renderScriptError
} from './render'
import Router from './router'
import { getAvailableChunks } from './utils'
import getConfig from './config'
// We need to go up one more level since we are in the `dist` directory
import pkg from '../../package'
import reactPkg from 'react/package'

// TODO: Remove this in Next.js 5
if (!(/^16\./.test(reactPkg.version))) {
  const message = `
Error: Next.js 4 requires React 16.
Install React 16 with:
  npm remove react react-dom
  npm install --save react@16 react-dom@16
`
  console.error(message)
  process.exit(1)
}

const internalPrefixes = [
  /^\/_next\//,
  /^\/static\//
]

const blockedPages = {
  '/_document': true,
  '/_error': true
}

export default class Server {
  constructor ({ dir = '.', dev = false, staticMarkup = false, quiet = false, conf = null } = {}) {
    // When in dev mode, remap the inline source maps that we generate within the webpack portion
    // of the build.
    if (dev) {
      require('source-map-support').install({
        hookRequire: true
      })
    }

    this.dir = resolve(dir)
    this.dev = dev
    this.quiet = quiet
    this.router = new Router()
    this.hotReloader = dev ? this.getHotReloader(this.dir, { quiet, conf }) : null
    this.http = null
    this.config = getConfig(this.dir, conf)
    this.dist = this.config.distDir
    if (!dev && !fs.existsSync(resolve(dir, this.dist, 'BUILD_ID'))) {
      console.error(`> Could not find a valid build in the '${this.dist}' directory! Try building your app with 'next build' before starting the server.`)
      process.exit(1)
    }
    this.buildStats = !dev ? require(join(this.dir, this.dist, 'build-stats.json')) : null
    this.buildId = !dev ? this.readBuildId() : '-'
    this.renderOpts = {
      dev,
      staticMarkup,
      dir: this.dir,
      hotReloader: this.hotReloader,
      buildStats: this.buildStats,
      buildId: this.buildId,
      assetPrefix: this.config.assetPrefix.replace(/\/$/, ''),
      availableChunks: dev ? {} : getAvailableChunks(this.dir, this.dist)
    }

    this.defineRoutes()
  }

  getHotReloader (dir, options) {
    const HotReloader = require('./hot-reloader').default
    return new HotReloader(dir, options)
  }

  handleRequest (req, res, parsedUrl) {
    // Parse url if parsedUrl not provided
    if (!parsedUrl || typeof parsedUrl !== 'object') {
      parsedUrl = parseUrl(req.url, true)
    }

    // Parse the querystring ourselves if the user doesn't handle querystring parsing
    if (typeof parsedUrl.query === 'string') {
      parsedUrl.query = parseQs(parsedUrl.query)
    }

    res.statusCode = 200
    return this.run(req, res, parsedUrl)
      .catch((err) => {
        if (!this.quiet) console.error(err)
        res.statusCode = 500
        res.end(STATUS_CODES[500])
      })
  }

  getRequestHandler () {
    return this.handleRequest.bind(this)
  }

  async prepare () {
    if (this.hotReloader) {
      await this.hotReloader.start()
    }
  }

  async close () {
    if (this.hotReloader) {
      await this.hotReloader.stop()
    }

    if (this.http) {
      await new Promise((resolve, reject) => {
        this.http.close((err) => {
          if (err) return reject(err)
          return resolve()
        })
      })
    }
  }

  defineRoutes () {
    const routes = {
      '/_next-prefetcher.js': async (req, res, params) => {
        const p = join(__dirname, '../client/next-prefetcher-bundle.js')
        await this.serveStatic(req, res, p)
      },

      // This is to support, webpack dynamic imports in production.
      '/_next/webpack/chunks/:name': async (req, res, params) => {
        // Cache aggressively in production
        if (!this.dev) {
          res.setHeader('Cache-Control', 'max-age=31536000, immutable')
        }
        const p = join(this.dir, this.dist, 'chunks', params.name)
        await this.serveStatic(req, res, p)
      },

      // This is to support, webpack dynamic import support with HMR
      '/_next/webpack/:id': async (req, res, params) => {
        const p = join(this.dir, this.dist, 'chunks', params.id)
        await this.serveStatic(req, res, p)
      },

      '/_next/:hash/manifest.js': async (req, res, params) => {
        if (!this.dev) return this.send404(res)

        this.handleBuildHash('manifest.js', params.hash, res)
        const p = join(this.dir, this.dist, 'manifest.js')
        await this.serveStatic(req, res, p)
      },

      '/_next/:hash/main.js': async (req, res, params) => {
        if (!this.dev) return this.send404(res)

        this.handleBuildHash('main.js', params.hash, res)
        const p = join(this.dir, this.dist, 'main.js')
        await this.serveStatic(req, res, p)
      },

      '/_next/:hash/commons.js': async (req, res, params) => {
        if (!this.dev) return this.send404(res)

        this.handleBuildHash('commons.js', params.hash, res)
        const p = join(this.dir, this.dist, 'commons.js')
        await this.serveStatic(req, res, p)
      },

      '/_next/:hash/app.js': async (req, res, params) => {
        if (this.dev) return this.send404(res)

        this.handleBuildHash('app.js', params.hash, res)
        const p = join(this.dir, this.dist, 'app.js')
        await this.serveStatic(req, res, p)
      },

      '/_next/:buildId/page/_error*': async (req, res, params) => {
        if (!this.handleBuildId(params.buildId, res)) {
          const error = new Error('INVALID_BUILD_ID')
          const customFields = { buildIdMismatched: true }

          return await renderScriptError(req, res, '/_error', error, customFields, this.renderOpts)
        }

        const p = join(this.dir, `${this.dist}/bundles/pages/_error.js`)
        await this.serveStatic(req, res, p)
      },

      '/_next/:buildId/page/:path*': async (req, res, params) => {
        const paths = params.path || ['']
        // We need to remove `.js` from the page otherwise it won't work with
        // page rewrites
        // eg:- we re-write page/index.js into page.js
        const page = `/${paths.join('/')}`.replace('.js', '')

        if (!this.handleBuildId(params.buildId, res)) {
          const error = new Error('INVALID_BUILD_ID')
          const customFields = { buildIdMismatched: true }

          return await renderScriptError(req, res, page, error, customFields, this.renderOpts)
        }

        if (this.dev) {
          try {
            await this.hotReloader.ensurePage(page)
          } catch (error) {
            return await renderScriptError(req, res, page, error, {}, this.renderOpts)
          }

          const compilationErr = await this.getCompilationError()
          if (compilationErr) {
            const customFields = { statusCode: 500 }
            return await renderScriptError(req, res, page, compilationErr, customFields, this.renderOpts)
          }
        }

        await renderScript(req, res, page, this.renderOpts)
      },

      // It's very important keep this route's param optional.
      // (but it should support as many as params, seperated by '/')
      // Othewise this will lead to a pretty simple DOS attack.
      // See more: https://github.com/zeit/next.js/issues/2617
      '/_next/:path*': async (req, res, params) => {
        const p = join(__dirname, '..', 'client', ...(params.path || []))
        await this.serveStatic(req, res, p)
      },

      // It's very important keep this route's param optional.
      // (but it should support as many as params, seperated by '/')
      // Othewise this will lead to a pretty simple DOS attack.
      // See more: https://github.com/zeit/next.js/issues/2617
      '/static/:path*': async (req, res, params) => {
        const p = join(this.dir, 'static', ...(params.path || []))
        await this.serveStatic(req, res, p)
      }
    }

    if (this.config.useFileSystemPublicRoutes) {
      routes['/:path*'] = async (req, res, params, parsedUrl) => {
        const { pathname, query } = parsedUrl
        await this.render(req, res, pathname, query)
      }
    }

    for (const method of ['GET', 'HEAD']) {
      for (const p of Object.keys(routes)) {
        this.router.add(method, p, routes[p])
      }
    }
  }

  async start (port, hostname) {
    await this.prepare()
    this.http = http.createServer(this.getRequestHandler())
    await new Promise((resolve, reject) => {
      // This code catches EADDRINUSE error if the port is already in use
      this.http.on('error', reject)
      this.http.on('listening', () => resolve())
      this.http.listen(port, hostname)
    })
  }

  async run (req, res, parsedUrl) {
    if (this.hotReloader) {
      await this.hotReloader.run(req, res)
    }

    const fn = this.router.match(req, res, parsedUrl)
    if (fn) {
      await fn()
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await this.render404(req, res, parsedUrl)
    } else {
      res.statusCode = 501
      res.end(STATUS_CODES[501])
    }
  }

  async render (req, res, pathname, query, parsedUrl) {
    if (this.isInternalUrl(req)) {
      return this.handleRequest(req, res, parsedUrl)
    }

    if (blockedPages[pathname]) {
      return await this.render404(req, res, parsedUrl)
    }

    if (this.config.poweredByHeader) {
      res.setHeader('X-Powered-By', `Next.js ${pkg.version}`)
    }
    const html = await this.renderToHTML(req, res, pathname, query)
    return sendHTML(req, res, html, req.method, this.renderOpts)
  }

  async renderToHTML (req, res, pathname, query) {
    if (this.dev) {
      const compilationErr = await this.getCompilationError()
      if (compilationErr) {
        res.statusCode = 500
        return this.renderErrorToHTML(compilationErr, req, res, pathname, query)
      }
    }

    try {
      return await renderToHTML(req, res, pathname, query, this.renderOpts)
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404
        return this.renderErrorToHTML(null, req, res, pathname, query)
      } else {
        if (!this.quiet) console.error(err)
        res.statusCode = 500
        return this.renderErrorToHTML(err, req, res, pathname, query)
      }
    }
  }

  async renderError (err, req, res, pathname, query) {
    const html = await this.renderErrorToHTML(err, req, res, pathname, query)
    return sendHTML(req, res, html, req.method, this.renderOpts)
  }

  async renderErrorToHTML (err, req, res, pathname, query) {
    if (this.dev) {
      const compilationErr = await this.getCompilationError()
      if (compilationErr) {
        res.statusCode = 500
        return renderErrorToHTML(compilationErr, req, res, pathname, query, this.renderOpts)
      }
    }

    try {
      return await renderErrorToHTML(err, req, res, pathname, query, this.renderOpts)
    } catch (err2) {
      if (this.dev) {
        if (!this.quiet) console.error(err2)
        res.statusCode = 500
        return renderErrorToHTML(err2, req, res, pathname, query, this.renderOpts)
      } else {
        throw err2
      }
    }
  }

  async render404 (req, res, parsedUrl = parseUrl(req.url, true)) {
    const { pathname, query } = parsedUrl
    res.statusCode = 404
    return this.renderError(null, req, res, pathname, query)
  }

  async serveStatic (req, res, path) {
    if (!this.isServeableUrl(path)) {
      return this.render404(req, res)
    }

    try {
      return await serveStatic(req, res, path)
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.render404(req, res)
      } else {
        throw err
      }
    }
  }

  isServeableUrl (path) {
    const resolved = resolve(path)
    if (
      resolved.indexOf(join(this.dir, this.dist) + sep) !== 0 &&
      resolved.indexOf(join(this.dir, 'static') + sep) !== 0
    ) {
      // Seems like the user is trying to traverse the filesystem.
      return false
    }

    return true
  }

  isInternalUrl (req) {
    for (const prefix of internalPrefixes) {
      if (prefix.test(req.url)) {
        return true
      }
    }

    return false
  }

  readBuildId () {
    const buildIdPath = join(this.dir, this.dist, 'BUILD_ID')
    const buildId = fs.readFileSync(buildIdPath, 'utf8')
    return buildId.trim()
  }

  handleBuildId (buildId, res) {
    if (this.dev) {
      res.setHeader('Cache-Control', 'no-store, must-revalidate')
      return true
    }

    if (buildId !== this.renderOpts.buildId) {
      return false
    }

    res.setHeader('Cache-Control', 'max-age=31536000, immutable')
    return true
  }

  async getCompilationError () {
    if (!this.hotReloader) return

    const errors = await this.hotReloader.getCompilationErrors()
    if (!errors.size) return

    // Return the very first error we found.
    return Array.from(errors.values())[0][0]
  }

  handleBuildHash (filename, hash, res) {
    if (this.dev) {
      res.setHeader('Cache-Control', 'no-store, must-revalidate')
      return true
    }

    if (hash !== this.buildStats[filename].hash) {
      throw new Error(`Invalid Build File Hash(${hash}) for chunk: ${filename}`)
    }

    res.setHeader('Cache-Control', 'max-age=31536000, immutable')
    return true
  }

  send404 (res) {
    res.statusCode = 404
    res.end('404 - Not Found')
  }
}
