import http from 'http'
import { resolve } from 'path'
import send from 'send'
import Router from './router'
import { render, renderJSON } from './render'

export default class Server {
  constructor ({ dir = '.', dev = false }) {
    this.dir = resolve(dir)
    this.dev = dev
    this.router = new Router()

    this.http = http.createServer((req, res) => {
      this.run(req, res)
      .catch((err) => {
        console.error(err)
        res.status(500);
        res.end('error');
      })
    })
  }

  async start (port) {
    this.router.get('/_next/:path+', async (req, res, params) => {
      const p = resolve(__dirname, '../client', (params.path || []).join('/'))
      await this.serveStatic(req, res, p)
    })

    this.router.get('/static/:path+', async (req, res, params) => {
      const p = resolve(this.dir, 'static', (params.path || []).join('/'))
      await this.serveStatic(req, res, p)
    })

    this.router.get('/:path+.json', async (req, res, params) => {
      const path = (params.path || []).join('/')
      await this.renderJSON(path, req, res)
    })

    this.router.get('/:path*', async (req, res, params) => {
      const path = (params.path || []).join('/')
      await this.render(path, req, res)
    })

    await new Promise((resolve, reject) => {
      this.http.listen(port, (err) => {
        if (err) return reject(err)
        resolve()
      })
    })
  }

  async run (req, res) {
    const fn = this.router.match(req, res)
    if (fn) {
      await fn()
    } else {
      await this.render404(req, res)
    }
  }

  async render (path, req, res) {
    const { dir, dev } = this
    let html
    try {
      html = await render(path, { req, res }, { dir, dev })
    } catch (err) {
      let statusCode
      if ('ENOENT' === err.code) {
        statusCode = 404
      } else {
        console.error(err)
        statusCode = 500
      }
      res.statusCode = err.statusCode = statusCode
      html = await render('_error', { req, res, err }, { dir, dev })
    }

    res.setHeader('Content-Type', 'text/html')
    res.setHeader('Content-Length', Buffer.byteLength(html))
    res.end(html)
  }

  async renderJSON (path, req, res) {
    const { dir } = this
    let json
    try {
      json = await renderJSON(path, { dir })
    } catch (err) {
      if ('ENOENT' === err.code) {
        res.statusCode = 404
      } else {
        console.error(err)
        res.statusCode = 500
      }
      json = await renderJSON('_error', { dir })
    }

    const data = JSON.stringify(json)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Length', Buffer.byteLength(data))
    res.end(data)
  }

  serveStatic (req, res, path) {
    return new Promise((resolve, reject) => {
      send(req, path)
      .on('error', (err) => {
        if ('ENOENT' === err.code) {
          this.render404(req, res).then(resolve, reject)
        } else {
          reject(err)
        }
      })
      .pipe(res)
      .on('finish', resolve)
    })
  }
}
