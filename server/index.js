import { resolve, join } from 'path'
import { parse } from 'url'
import http from 'http'
import send from 'send'
import {
  renderToHTML,
  renderErrorToHTML,
  renderJSON,
  renderErrorJSON,
  sendHTML
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
    return (req, res) => {
      this.run(req, res)
      .catch((err) => {
        if (!this.quiet) console.error(err)
        res.statusCode = 500
        res.end('error')
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
  }

  defineRoutes () {
    this.router.get('/_next-prefetcher.js', async (req, res, params) => {
      const p = join(__dirname, '../client/next-prefetcher-bundle.js')
      await this.serveStatic(req, res, p)
    })

    this.router.get('/_next/main.js', async (req, res, params) => {
      const p = join(this.dir, '.next/main.js')
      await this.serveStatic(req, res, p)
    })

    this.router.get('/_next/commons.js', async (req, res, params) => {
      const p = join(this.dir, '.next/commons.js')
      await this.serveStatic(req, res, p)
    })

    this.router.get('/_next/pages/:path*', async (req, res, params) => {
      const paths = params.path || []
      const pathname = `/${paths.join('/')}`
      await this.renderJSON(res, pathname)
    })

    this.router.get('/_next/:path+', async (req, res, params) => {
      const p = join(__dirname, '..', 'client', ...(params.path || []))
      await this.serveStatic(req, res, p)
    })
    this.router.get('/static/:path+', async (req, res, params) => {
      const p = join(this.dir, 'static', ...(params.path || []))
      await this.serveStatic(req, res, p)
    })

    this.router.get('/:path*', async (req, res) => {
      const { pathname, query } = parse(req.url, true)
      await this.render(req, res, pathname, query)
    })
  }

  async start (port) {
    await this.prepare()
    this.http = http.createServer(this.getRequestHandler())
    await new Promise((resolve, reject) => {
      this.http.listen(port, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  async run (req, res) {
    if (this.hotReloader) {
      await this.hotReloader.run(req, res)
    }

    const fn = this.router.match(req, res)
    if (fn) {
      await fn()
    } else {
      await this.render404(req, res)
    }
  }

  async render (req, res, pathname, query) {
    if (this.config.poweredByHeader) {
      res.setHeader('X-Powered-By', `Next.js ${pkg.version}`)
    }
    const html = await this.renderToHTML(req, res, pathname, query)
    sendHTML(res, html)
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
    sendHTML(res, html)
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

  async render404 (req, res) {
    const { pathname, query } = parse(req.url, true)
    res.statusCode = 404
    this.renderErrorToHTML(null, req, res, pathname, query)
  }

  async renderJSON (res, page) {
    if (this.dev) {
      const compilationErr = this.getCompilationError(page)
      if (compilationErr) {
        return this.renderErrorJSON(compilationErr, res)
      }
    }

    try {
      await renderJSON(res, page, this.renderOpts)
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404
        return this.renderErrorJSON(null, res)
      } else {
        if (!this.quiet) console.error(err)
        res.statusCode = 500
        return this.renderErrorJSON(err, res)
      }
    }
  }

  async renderErrorJSON (err, res) {
    if (this.dev) {
      const compilationErr = this.getCompilationError('/_error')
      if (compilationErr) {
        res.statusCode = 500
        return renderErrorJSON(compilationErr, res, this.renderOpts)
      }
    }

    return renderErrorJSON(err, res, this.renderOpts)
  }

  serveStatic (req, res, path) {
    return new Promise((resolve, reject) => {
      send(req, path)
      .on('error', (err) => {
        if (err.code === 'ENOENT') {
          this.render404(req, res).then(resolve, reject)
        } else {
          reject(err)
        }
      })
      .pipe(res)
      .on('finish', resolve)
    })
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
