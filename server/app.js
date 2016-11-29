import { resolve, join } from 'path'
import { parse } from 'url'
import send from 'send'
import accepts from 'accepts'
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

export default class App {
  constructor (dir, { dev = false } = {}) {
    this.dir = resolve(dir || '.')
    this.dev = dev
    this.router = new Router()
    this.hotReloader = dev ? new HotReloader(this.dir) : null

    this.defineRoutes()
  }

  getRequestHandler () {
    return (req, res) => {
      this.run(req, res)
      .catch((err) => {
        console.error(err)
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

  defineRoutes () {
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
      const accept = accepts(req)
      if (accept.type(['json', 'html']) === 'json') {
        await this.renderJSON(res, pathname)
      } else {
        await this.render(req, res, pathname, query)
      }
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
    const html = await this.renderToHTML(req, res, pathname, query)
    sendHTML(res, html)
  }

  async renderToHTML (req, res, pathname, query) {
    const { dir, dev } = this

    if (dev) {
      const compilationErr = this.getCompilationError(pathname)
      if (compilationErr) {
        res.statusCode = 500
        return this.renderErrorToHTML(compilationErr, req, res, pathname, query)
      }
    }

    const opts = { dir, dev }

    try {
      return await renderToHTML(req, res, pathname, query, opts)
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404
        return this.renderErrorToHTML(null, req, res, pathname, query)
      } else {
        console.error(err)
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
    const { dir, dev } = this
    const opts = { dir, dev }

    if (dev) {
      const compilationErr = this.getCompilationError('/_error')
      if (compilationErr) {
        res.statusCode = 500
        return renderErrorToHTML(compilationErr, req, res, pathname, query, opts)
      }
    }

    try {
      return await renderErrorToHTML(err, req, res, pathname, query, opts)
    } catch (err2) {
      if (dev) {
        console.error(err2)
        res.statusCode = 500
        return renderErrorToHTML(err2, req, res, pathname, query, opts)
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
    const { dir, dev } = this

    if (dev) {
      const compilationErr = this.getCompilationError(page)
      if (compilationErr) {
        return this.renderErrorJSON(compilationErr, res)
      }
    }

    const opts = { dir, dev }

    try {
      await renderJSON(res, page, opts)
    } catch (err) {
      if (err.code === 'ENOENT') {
        res.statusCode = 404
        return this.renderErrorJSON(null, res)
      } else {
        console.error(err)
        res.statusCode = 500
        return this.renderErrorJSON(err, res)
      }
    }
  }

  async renderErrorJSON (err, res) {
    const { dir, dev } = this
    const opts = { dir, dev }

    if (dev) {
      const compilationErr = this.getCompilationError('/_error')
      if (compilationErr) {
        res.statusCode = 500
        return renderErrorJSON(compilationErr, res, opts)
      }
    }

    return renderErrorJSON(err, res, opts)
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

