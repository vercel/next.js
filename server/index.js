import { resolve, join } from 'path'
import { parse as parseUrl } from 'url'
import { parse as parseQs } from 'querystring'
import fs from 'fs'
import http, { STATUS_CODES } from 'http'
import {
  renderToHTML,
  renderErrorToHTML,
  renderJSON,
  renderErrorJSON,
  sendHTML,
  serveStatic
} from './render'
import Router from './router'
import HotReloader from './hot-reloader'
import { resolveFromList } from './resolve'
import getConfig from './config'
// We need to go up one more level since we are in the `dist` directory
import pkg from '../../package'

export default class Server {
  constructor ({ dir = '.', dev = false, staticMarkup = false, quiet = false } = {}) {
    this.dir = resolve(dir)
    this.dev = dev
    this.quiet = quiet
    this.router = new Router()
    this.hotReloader = dev ? new HotReloader(this.dir, { quiet }) : null
    this.http = null
    this.config = getConfig(this.dir)
    this.buildStats = !dev ? require(join(this.dir, '.next', 'build-stats.json')) : null
    this.buildId = !dev ? this.readBuildId() : '-'
    this.renderOpts = {
      dev,
      staticMarkup,
      dir: this.dir,
      hotReloader: this.hotReloader,
      buildStats: this.buildStats,
      buildId: this.buildId
    }

    this.defineRoutes()
  }

  getRequestHandler () {
    return (req, res, parsedUrl) => {
      // Parse url if parsedUrl not provided
      if (!parsedUrl) {
        parsedUrl = parseUrl(req.url, true)
      }

      // Parse the querystring ourselves if the user doesn't handle querystring parsing
      if (typeof parsedUrl.query === 'string') {
        parsedUrl.query = parseQs(parsedUrl.query)
      }

      return this.run(req, res, parsedUrl)
      .catch((err) => {
        if (!this.quiet) console.error(err)
        res.statusCode = 500
        res.end(STATUS_CODES[500])
      })
    }
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

      '/_next/:hash/manifest.js': async (req, res, params) => {
        this.handleBuildHash('manifest.js', params.hash, res)
        const p = join(this.dir, '.next/manifest.js')
        await this.serveStatic(req, res, p)
      },

      '/_next/:hash/main.js': async (req, res, params) => {
        this.handleBuildHash('main.js', params.hash, res)
        const p = join(this.dir, '.next/main.js')
        await this.serveStatic(req, res, p)
      },

      '/_next/:hash/commons.js': async (req, res, params) => {
        this.handleBuildHash('commons.js', params.hash, res)
        const p = join(this.dir, '.next/commons.js')
        await this.serveStatic(req, res, p)
      },

      '/_next/:hash/app.js': async (req, res, params) => {
        this.handleBuildHash('app.js', params.hash, res)
        const p = join(this.dir, '.next/app.js')
        await this.serveStatic(req, res, p)
      },

      '/_next/:buildId/pages/:path*': async (req, res, params) => {
        if (!this.handleBuildId(params.buildId, res)) {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ buildIdMismatch: true }))
          return
        }

        const paths = params.path || ['index']
        const pathname = `/${paths.join('/')}`

        await this.renderJSON(req, res, pathname)
      },

      '/_next/:path+': async (req, res, params) => {
        const p = join(__dirname, '..', 'client', ...(params.path || []))
        await this.serveStatic(req, res, p)
      },

      '/static/:path+': async (req, res, params) => {
        const p = join(this.dir, 'static', ...(params.path || []))
        await this.serveStatic(req, res, p)
      },

      '/:path*': async (req, res, params, parsedUrl) => {
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

  async render (req, res, pathname, query) {
    if (this.config.poweredByHeader) {
      res.setHeader('X-Powered-By', `Next.js ${pkg.version}`)
    }
    const html = await this.renderToHTML(req, res, pathname, query)
    return sendHTML(res, html, req.method)
  }

  async renderToHTML (req, res, pathname, query) {
    if (this.dev) {
      const compilationErr = this.getCompilationError(pathname)
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
    return sendHTML(res, html, req.method)
  }

  async renderErrorToHTML (err, req, res, pathname, query) {
    if (this.dev) {
      const compilationErr = this.getCompilationError('/_error')
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

  async renderJSON (req, res, page) {
    if (this.dev) {
      const compilationErr = this.getCompilationError(page)
      if (compilationErr) {
        return this.renderErrorJSON(compilationErr, req, res)
      }
    }

    try {
      return await renderJSON(req, res, page, this.renderOpts)
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404
        return this.renderErrorJSON(null, req, res)
      } else {
        if (!this.quiet) console.error(err)
        res.statusCode = 500
        return this.renderErrorJSON(err, req, res)
      }
    }
  }

  async renderErrorJSON (err, req, res) {
    if (this.dev) {
      const compilationErr = this.getCompilationError('/_error')
      if (compilationErr) {
        res.statusCode = 500
        return renderErrorJSON(compilationErr, req, res, this.renderOpts)
      }
    }

    return renderErrorJSON(err, req, res, this.renderOpts)
  }

  async serveStatic (req, res, path) {
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

  readBuildId () {
    const buildIdPath = join(this.dir, '.next', 'BUILD_ID')
    const buildId = fs.readFileSync(buildIdPath, 'utf8')
    return buildId.trim()
  }

  handleBuildId (buildId, res) {
    if (this.dev) return true
    if (buildId !== this.renderOpts.buildId) {
      return false
    }

    res.setHeader('Cache-Control', 'max-age=365000000, immutable')
    return true
  }

  getCompilationError (page) {
    if (!this.hotReloader) return

    const errors = this.hotReloader.getCompilationErrors()
    if (!errors.size) return

    const id = join(this.dir, '.next', 'bundles', 'pages', page)
    const p = resolveFromList(id, errors.keys())
    if (p) return errors.get(p)[0]
  }

  handleBuildHash (filename, hash, res) {
    if (this.dev) return
    if (hash !== this.buildStats[filename].hash) {
      throw new Error(`Invalid Build File Hash(${hash}) for chunk: ${filename}`)
    }

    res.setHeader('Cache-Control', 'max-age=365000000, immutable')
  }
}
