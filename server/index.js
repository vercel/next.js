import http from 'http'
import { resolve, join } from 'path'
import { parse } from 'url'
import send from 'send'
import Router from './router'
import { render, renderJSON, errorToJSON } from './render'
import HotReloader from './hot-reloader'
import { resolveFromList } from './resolve'

export default class Server {
  constructor ({ dir = '.', dev = false, hotReload = false }) {
    this.dir = resolve(dir)
    this.dev = dev
    this.hotReloader = hotReload ? new HotReloader(this.dir, this.dev) : null
    this.router = new Router()

    this.http = http.createServer((req, res) => {
      this.run(req, res)
      .catch((err) => {
        console.error(err)
        res.statusCode = 500
        res.end('error')
      })
    })

    this.defineRoutes()
  }

  async start (port) {
    if (this.hotReloader) {
      await this.hotReloader.start()
    }

    await new Promise((resolve, reject) => {
      this.http.listen(port, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  defineRoutes () {
    this.router.get('/_next-prefetcher.js', async (req, res, params) => {
      const p = join(__dirname, '../client/next-prefetcher-bundle.js')
      await this.serveStatic(req, res, p)
    })

    this.router.get('/_next/commons.js', async (req, res, params) => {
      const p = join(this.dir, '.next/commons.js')
      await this.serveStatic(req, res, p)
    })

    this.router.get('/_next/:path+', async (req, res, params) => {
      const p = join(__dirname, '..', 'client', ...(params.path || []))
      await this.serveStatic(req, res, p)
    })
    this.router.get('/static/:path+', async (req, res, params) => {
      const p = join(this.dir, 'static', ...(params.path || []))
      await this.serveStatic(req, res, p)
    })

    this.router.get('/:path+.json', async (req, res) => {
      await this.renderJSON(req, res)
    })

    this.router.get('/:path*', async (req, res) => {
      await this.render(req, res)
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

  async render (req, res) {
    const { pathname, query } = parse(req.url, true)
    const ctx = { req, res, pathname, query }

    const compilationErr = this.getCompilationError(req.url)
    if (compilationErr) {
      await this.doRender(res, 500, '/_error-debug', { ...ctx, err: compilationErr })
      return
    }

    try {
      await this.doRender(res, 200, req.url, ctx)
    } catch (err) {
      const compilationErr2 = this.getCompilationError('/_error')
      if (compilationErr2) {
        await this.doRender(res, 500, '/_error-debug', { ...ctx, err: compilationErr2 })
        return
      }

      if (err.code !== 'ENOENT') {
        console.error(err)
        const url = this.dev ? '/_error-debug' : '/_error'
        await this.doRender(res, 500, url, { ...ctx, err })
        return
      }

      try {
        await this.doRender(res, 404, '/_error', { ...ctx, err })
      } catch (err2) {
        if (this.dev) {
          await this.doRender(res, 500, '/_error-debug', { ...ctx, err: err2 })
        } else {
          throw err2
        }
      }
    }
  }

  async doRender (res, statusCode, url, ctx) {
    const { dir, dev } = this

    // need to set statusCode before `render`
    // since it can be used on getInitialProps
    res.statusCode = statusCode

    const html = await render(url, ctx, { dir, dev })
    sendHTML(res, html)
  }

  async renderJSON (req, res) {
    const compilationErr = this.getCompilationError(req.url)
    if (compilationErr) {
      await this.doRenderJSON(res, 500, '/_error-debug.json', compilationErr)
      return
    }

    try {
      await this.doRenderJSON(res, 200, req.url)
    } catch (err) {
      const compilationErr2 = this.getCompilationError('/_error.json')
      if (compilationErr2) {
        await this.doRenderJSON(res, 500, '/_error-debug.json', compilationErr2)
        return
      }

      if (err.code === 'ENOENT') {
        await this.doRenderJSON(res, 404, '/_error.json')
      } else {
        console.error(err)
        await this.doRenderJSON(res, 500, '/_error.json')
      }
    }
  }

  async doRenderJSON (res, statusCode, url, err) {
    const { dir } = this
    const json = await renderJSON(url, { dir })
    if (err) {
      json.err = errorToJSON(err)
    }

    const data = JSON.stringify(json)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Length', Buffer.byteLength(data))
    res.statusCode = statusCode
    res.end(data)
  }

  async render404 (req, res) {
    const { pathname, query } = parse(req.url, true)
    const ctx = { req, res, pathname, query }

    const compilationErr = this.getCompilationError('/_error')
    if (compilationErr) {
      await this.doRender(res, 500, '/_error-debug', { ...ctx, err: compilationErr })
      return
    }

    try {
      await this.doRender(res, 404, '/_error', ctx)
    } catch (err) {
      if (this.dev) {
        await this.doRender(res, 500, '/_error-debug', { ...ctx, err })
      } else {
        throw err
      }
    }
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

  getCompilationError (url) {
    if (!this.hotReloader) return

    const errors = this.hotReloader.getCompilationErrors()
    if (!errors.size) return

    const p = parse(url || '/').pathname.replace(/\.json$/, '')
    const id = join(this.dir, '.next', 'bundles', 'pages', p)
    const path = resolveFromList(id, errors.keys())
    if (path) return errors.get(path)[0]
  }
}

function sendHTML (res, html) {
  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Content-Length', Buffer.byteLength(html))
  res.end(html)
}
