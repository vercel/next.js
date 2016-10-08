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
      this.run(req, res).catch((err) => {
        this.renderError(req, res, err)
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
      await this.renderJSON(req, res, path)
    })

    this.router.get('/:path*', async (req, res, params) => {
      const path = (params.path || []).join('/')
      await this.render(req, res, path)
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

  async render (req, res, path) {
    const { dir, dev } = this
    let html
    try {
      html = await render(path, req, res, { dir, dev })
    } catch (err) {
      if ('ENOENT' === err.code) {
        return this.render404(req, res)
      }
      throw err
    }
    res.setHeader('Content-Type', 'text/html')
    res.setHeader('Content-Length', Buffer.byteLength(html))
    res.end(html)
  }

  async renderJSON (req, res, path) {
    const { dir } = this
    let json
    try {
      json = await renderJSON(path, { dir })
    } catch (err) {
      if ('ENOENT' === err.code) {
        return this.render404(req, res)
      }
      throw err
    }

    const data = JSON.stringify(json)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Length', Buffer.byteLength(data))
    res.end(data)
  }

  async render404 (req, res) {
    res.writeHead(404)
    res.end('Not Found')
  }

  async renderError (req, res, err) {
    console.error(err)
    res.writeHead(500)
    res.end('Error')
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
