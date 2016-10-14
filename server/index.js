import http from 'http'
import { resolve } from 'path'
import send from 'send'
import Router from './router'
import { render, renderJSON } from './render'
import HotReloader from './hot-reloader'

export default class Server {
  constructor ({ dir = '.', dev = false, hotReloader }) {
    this.dir = resolve(dir)
    this.dev = dev
    this.hotReloader = hotReloader
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

    this.router.get('/:path+.json', async (req, res) => {
      await this.renderJSON(req, res)
    })

    this.router.get('/:path*', async (req, res) => {
      await this.render(req, res)
    })

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

  async run (req, res) {
    const fn = this.router.match(req, res)
    if (fn) {
      await fn()
    } else {
      await this.render404(req, res)
    }
  }

  async render (req, res) {
    const { dir, dev, hotReloader } = this
    const mfs = hotReloader ? hotReloader.fileSystem : null
    let html
    try {
      html = await render(req.url, { req, res }, { dir, dev, mfs })
    } catch (err) {
      if ('ENOENT' === err.code) {
        res.statusCode = 404
      } else {
        console.error(err)
        res.statusCode = 500
      }
      html = await render('/_error', { req, res, err }, { dir, dev, mfs })
    }

    sendHTML(res, html)
  }

  async renderJSON (req, res) {
    const { dir, hotReloader } = this
    const mfs = hotReloader ? hotReloader.fileSystem : null
    let json
    try {
      json = await renderJSON(req.url, { dir, mfs })
    } catch (err) {
      if ('ENOENT' === err.code) {
        res.statusCode = 404
      } else {
        console.error(err)
        res.statusCode = 500
      }
      json = await renderJSON('/_error.json', { dir, mfs })
    }

    const data = JSON.stringify(json)
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Content-Length', Buffer.byteLength(data))
    res.end(data)
  }

  async render404 (req, res) {
    const { dir, dev } = this

    res.statusCode = 404
    const html = await render('/_error', { req, res }, { dir, dev })
    sendHTML(res, html)
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

function sendHTML (res, html) {
  res.setHeader('Content-Type', 'text/html')
  res.setHeader('Content-Length', Buffer.byteLength(html))
  res.end(html)
}
