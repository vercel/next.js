import { resolve, join } from 'path'
import { parse } from 'url'
import fs from 'mz/fs'
import http, { STATUS_CODES } from 'http'
import {
  renderToHTML,
  renderErrorToHTML,
  renderJSON,
  renderErrorJSON,
  sendHTML,
  serveStatic,
  serveStaticWithGzip
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
    this.renderOpts = { dir: this.dir, dev, staticMarkup }
    this.router = new Router()
    this.hotReloader = dev ? new HotReloader(this.dir, { quiet }) : null
    this.http = null
    this.config = getConfig(this.dir)

    this.defineRoutes()
  }

  getRequestHandler () {
    return (req, res, parsedUrl) => {
      if (!parsedUrl) {
        parsedUrl = parse(req.url, true)
      }

      if (!parsedUrl.query) {
        throw new Error('Please provide a parsed url to `handle` as third parameter. See https://github.com/zeit/next.js#custom-server-and-routing for an example.')
      }

      this.run(req, res, parsedUrl)
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

    this.renderOpts.buildId = await this.readBuildId()
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

      '/_next/:buildId/main.js': async (req, res, params) => {
        this.handleBuildId(params.buildId, res)
        const p = join(this.dir, '.next/main.js')
        await this.serveStaticWithGzip(req, res, p)
      },

      '/_next/:buildId/commons.js': async (req, res, params) => {
        this.handleBuildId(params.buildId, res)
        const p = join(this.dir, '.next/commons.js')
        await this.serveStaticWithGzip(req, res, p)
      },

      '/_next/:buildId/pages/:path*': async (req, res, params) => {
        this.handleBuildId(params.buildId, res)
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
    sendHTML(res, html, req.method)
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
    sendHTML(res, html, req.method)
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

  async render404 (req, res, parsedUrl = parse(req.url, true)) {
    const { pathname, query } = parsedUrl
    res.statusCode = 404
    this.renderError(null, req, res, pathname, query)
  }

  async renderJSON (req, res, page) {
    if (this.dev) {
      const compilationErr = this.getCompilationError(page)
      if (compilationErr) {
        return this.renderErrorJSON(compilationErr, req, res)
      }
    }

    try {
      await renderJSON(req, res, page, this.renderOpts)
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

  async serveStaticWithGzip (req, res, path) {
    this._serveStatic(req, res, () => {
      return serveStaticWithGzip(req, res, path)
    })
  }

  serveStatic (req, res, path) {
    this._serveStatic(req, res, () => {
      return serveStatic(req, res, path)
    })
  }

  async _serveStatic (req, res, fn) {
    try {
      await fn()
    } catch (err) {
      if (err.code === 'ENOENT') {
        this.render404(req, res)
      } else {
        throw err
      }
    }
  }

  async readBuildId () {
    const buildIdPath = join(this.dir, '.next', 'BUILD_ID')
    try {
      const buildId = await fs.readFile(buildIdPath, 'utf8')
      return buildId.trim()
    } catch (err) {
      if (err.code === 'ENOENT') {
        return '-'
      } else {
        throw err
      }
    }
  }

  handleBuildId (buildId, res) {
    if (this.dev) return
    if (buildId !== this.renderOpts.buildId) {
      const errorMessage = 'Build id mismatch!' +
        'Seems like the server and the client version of files are not the same.'
      throw new Error(errorMessage)
    }

    res.setHeader('Cache-Control', 'max-age=365000000, immutable')
  }

  getCompilationError (page) {
    if (!this.hotReloader) return

    const errors = this.hotReloader.getCompilationErrors()
    if (!errors.size) return

    const id = join(this.dir, '.next', 'bundles', 'pages', page)
    const p = resolveFromList(id, errors.keys())
    if (p) return errors.get(p)[0]
  }
}
