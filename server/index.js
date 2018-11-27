import { resolve, join, sep } from 'path'
import { parse as parseUrl } from 'url'
import fs from 'fs'
import send from 'send'

import Boom from 'boom'
import Router from './router'
import getConfig from './config'
import { serializeError } from './render'

function serveStatic (req, res, path) {
  res.setHeader('Cache-Control', 'no-store, must-revalidate')

  return new Promise((resolve, reject) => {
    send(req, path)
      .on('directory', () => {
      // We don't allow directories to be read.
        const err = new Error('No directory access')
        err.code = 'ENOENT'
        reject(err)
      })
      .on('error', reject)
      .pipe(res)
      .on('finish', resolve)
  })
}

async function renderScriptError (req, res, page, error, customFields, { dev }) {
  page = page.replace(/(\/index)?\.js/, '') || '/'

  // Asks CDNs and others to not to cache the errored page
  res.setHeader('Cache-Control', 'no-store, must-revalidate')
  // prevent XSS attacks by filtering the page before printing it.
  page = JSON.stringify(page)
  res.setHeader('Content-Type', 'text/javascript')

  if (error.code === 'ENOENT') {
    res.end(`
      window.__NEXT_REGISTER_PAGE(${page}, function() {
        var error = new Error('Page does not exist: ${page}')
        error.statusCode = 404

        return { error: error }
      })
    `)
    return
  }

  const errorJson = {
    ...serializeError(dev, error),
    ...customFields
  }

  res.end(`
    window.__NEXT_REGISTER_PAGE('${page}', function() {
      var error = ${JSON.stringify(errorJson)}
      return { error: error }
    })
  `)
}

export default class Server {
  constructor ({ dir = '.', dev = false, quiet = false, conf = null } = {}) {
    this.dir = resolve(dir)
    this.dev = dev
    this.quiet = quiet
    this.router = new Router()
    this.hotReloader = dev ? this.getHotReloader(this.dir, { quiet, conf }) : null
    this.config = getConfig(this.dir, conf)
    if (!dev && !fs.existsSync(resolve(dir, '.next', 'BUILD_ID'))) {
      console.error(`> Could not find a valid build in the '${'.next'}' directory! Try building your app with 'next build' before starting the server.`)
      process.exit(1)
    }
    const buildId = !dev ? this.readBuildId() : '-'
    const assetPrefix = (this.config.assetPrefix || '').replace(/\/$/, '')
    this.renderOpts = {
      dev,
      dir: this.dir,
      hotReloader: this.hotReloader,
      publicPath: `${assetPrefix}/_next/`,
      buildId,
      entrypoints: !dev ? this.readEntrypoints() : undefined
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

    res.statusCode = 200
    return this.run(req, res, parsedUrl)
      .catch((err) => {
        if (!this.quiet) console.error(err)
        throw err
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
  }

  defineRoutes () {
    const routes = {
      '/_next/:hash/pages/:path*': async (req, res, params) => {
        const paths = params.path || ['']
        const page = `/${paths.join('/')}`
        const filename = `${params.hash}/pages${page.replace(/\.js$/, '')}.js`

        if (this.dev && page !== '/_error.js') {
          try {
            await this.hotReloader.ensurePage(page)
          } catch (error) {
            return renderScriptError(req, res, page, error, {}, this.renderOpts)
          }

          const compilationErr = await this.getCompilationError()
          if (compilationErr) {
            const customFields = { statusCode: 500 }
            return renderScriptError(req, res, page, compilationErr, customFields, this.renderOpts)
          }
        }

        try {
          const realPath = join(this.dir, '.next', 'bundles', filename)
          await serveStatic(req, res, realPath)
        } catch (err) {
          if (err.code === 'ENOENT') {
            renderScriptError(req, res, page, err, {}, this.renderOpts)
            return
          }

          throw err
        }
      }
    }

    for (const method of ['GET', 'HEAD']) {
      for (const p of Object.keys(routes)) {
        this.router.add(method, p, routes[p])
      }
    }
  }

  async run (req, res, parsedUrl) {
    if (this.hotReloader) {
      await this.hotReloader.run(req, res)
    } else {
      throw new Error(`Don't use this in prod...`)
    }

    const fn = this.router.match(req, res, parsedUrl)
    if (fn) {
      await fn()
      return
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      throw Boom.notFound()
    } else {
      throw Boom.notImplemented()
    }
  }

  serveStatic (req, res, path) {
    if (!this.isServeableUrl(path)) {
      throw Boom.notFound()
    }

    return serveStatic(req, res, path)
  }

  isServeableUrl (path) {
    const resolved = resolve(path)
    if (
      resolved.indexOf(join(this.dir, '.next') + sep) !== 0 &&
      resolved.indexOf(join(this.dir, 'static') + sep) !== 0
    ) {
      // Seems like the user is trying to traverse the filesystem.
      return false
    }

    return true
  }

  readBuildId () {
    const buildIdPath = join(this.dir, '.next', 'BUILD_ID')
    return fs.readFileSync(buildIdPath, 'utf8').trim()
  }

  readEntrypoints () {
    const buildIdPath = join(this.dir, '.next', 'webpack-entrypoints.json')
    return new Map(Object.entries(JSON.parse(fs.readFileSync(buildIdPath, 'utf8'))))
  }

  async getCompilationError () {
    if (!this.hotReloader) return

    const errors = await this.hotReloader.getCompilationErrors()
    if (!errors.size) return

    // Return the very first error we found.
    return Array.from(errors.values())[0][0]
  }
}
