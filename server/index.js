/* eslint-disable import/first, no-return-await */
import { resolve, join, sep } from 'path'
import { parse as parseUrl } from 'url'
import { parse as parseQs } from 'querystring'
import fs from 'fs'
import http, { STATUS_CODES } from 'http'
import {
  renderToHTML,
  renderErrorToHTML,
  sendHTML,
  serveStatic
} from './render'
import Router from './router'
import { isInternalUrl } from './utils'
import loadConfig from './config'
import {PHASE_PRODUCTION_SERVER, PHASE_DEVELOPMENT_SERVER, BLOCKED_PAGES, BUILD_ID_FILE, CLIENT_STATIC_FILES_PATH} from '../lib/constants'
import * as asset from '../lib/asset'
import * as envConfig from '../lib/runtime-config'
import { isResSent } from '../lib/utils'

// We need to go up one more level since we are in the `dist` directory
import pkg from '../../package'

export default class Server {
  constructor ({ dir = '.', dev = false, staticMarkup = false, quiet = false, conf = null } = {}) {
    this.dir = resolve(dir)
    this.dev = dev
    this.quiet = quiet
    this.router = new Router()
    this.http = null
    const phase = dev ? PHASE_DEVELOPMENT_SERVER : PHASE_PRODUCTION_SERVER
    this.nextConfig = loadConfig(phase, this.dir, conf)
    this.distDir = join(this.dir, this.nextConfig.distDir)

    // Only serverRuntimeConfig needs the default
    // publicRuntimeConfig gets it's default in client/index.js
    const {serverRuntimeConfig = {}, publicRuntimeConfig, assetPrefix, generateEtags} = this.nextConfig

    if (!dev && !fs.existsSync(resolve(this.distDir, BUILD_ID_FILE))) {
      console.error(`> Could not find a valid build in the '${this.distDir}' directory! Try building your app with 'next build' before starting the server.`)
      process.exit(1)
    }
    this.buildId = this.readBuildId(dev)
    this.hotReloader = dev ? this.getHotReloader(this.dir, { config: this.nextConfig, buildId: this.buildId }) : null
    this.renderOpts = {
      dev,
      staticMarkup,
      distDir: this.distDir,
      hotReloader: this.hotReloader,
      buildId: this.buildId,
      generateEtags
    }

    // Only the `publicRuntimeConfig` key is exposed to the client side
    // It'll be rendered as part of __NEXT_DATA__ on the client side
    if (publicRuntimeConfig) {
      this.renderOpts.runtimeConfig = publicRuntimeConfig
    }

    // Initialize next/config with the environment configuration
    envConfig.setConfig({
      serverRuntimeConfig,
      publicRuntimeConfig
    })

    this.setAssetPrefix(assetPrefix)
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

  setAssetPrefix (prefix) {
    this.renderOpts.assetPrefix = prefix ? prefix.replace(/\/$/, '') : ''
    asset.setAssetPrefix(this.renderOpts.assetPrefix)
  }

  async prepare () {
    await this.defineRoutes()
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

  async defineRoutes () {
    const routes = {
      '/_next/static/:path*': async (req, res, params) => {
        // The commons folder holds commonschunk files
        // The chunks folder holds dynamic entries
        // The buildId folder holds pages and potentially other assets. As buildId changes per build it can be long-term cached.
        // In development they don't have a hash, and shouldn't be cached by the browser.
        if (params.path[0] === 'commons' || params.path[0] === 'chunks' || params.path[0] === this.buildId) {
          if (this.dev) {
            res.setHeader('Cache-Control', 'no-store, must-revalidate')
          } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          }
        }
        const p = join(this.distDir, CLIENT_STATIC_FILES_PATH, ...(params.path || []))
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

    if (this.nextConfig.useFileSystemPublicRoutes) {
      // Makes `next export` exportPathMap work in development mode.
      // So that the user doesn't have to define a custom server reading the exportPathMap
      if (this.dev && this.nextConfig.exportPathMap) {
        console.log('Defining routes from exportPathMap')
        const exportPathMap = await this.nextConfig.exportPathMap({}) // In development we can't give a default path mapping
        for (const path in exportPathMap) {
          const {page, query = {}} = exportPathMap[path]
          routes[path] = async (req, res, params, parsedUrl) => {
            const { query: urlQuery } = parsedUrl

            Object.keys(urlQuery)
              .filter(key => query[key] === undefined)
              .forEach(key => console.warn(`Url defines a query parameter '${key}' that is missing in exportPathMap`))

            const mergedQuery = {...urlQuery, ...query}

            await this.render(req, res, page, mergedQuery, parsedUrl)
          }
        }
      }

      // In development we expose all compiled files for react-error-overlay's line show feature
      if (this.dev) {
        routes['/_next/development/:path*'] = async (req, res, params) => {
          const p = join(this.distDir, ...(params.path || []))
          await this.serveStatic(req, res, p)
        }
      }

      // It's very important keep this route's param optional.
      // (but it should support as many as params, seperated by '/')
      // Othewise this will lead to a pretty simple DOS attack.
      // See more: https://github.com/zeit/next.js/issues/2617
      routes['/_next/:path*'] = async (req, res, params) => {
        const p = join(__dirname, '..', 'client', ...(params.path || []))
        await this.serveStatic(req, res, p)
      }

      routes['/:path*'] = async (req, res, params, parsedUrl) => {
        const { pathname, query } = parsedUrl
        await this.render(req, res, pathname, query, parsedUrl)
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
      const {finished} = await this.hotReloader.run(req, res, parsedUrl)
      if (finished) {
        return
      }
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
    if (isInternalUrl(req.url)) {
      return this.handleRequest(req, res, parsedUrl)
    }

    if (BLOCKED_PAGES.indexOf(pathname) !== -1) {
      return await this.render404(req, res, parsedUrl)
    }

    const html = await this.renderToHTML(req, res, pathname, query)
    if (isResSent(res)) {
      return
    }

    if (this.nextConfig.poweredByHeader) {
      res.setHeader('X-Powered-By', `Next.js ${pkg.version}`)
    }
    return sendHTML(req, res, html, req.method, this.renderOpts)
  }

  async renderToHTML (req, res, pathname, query) {
    if (this.dev) {
      const compilationErr = await this.getCompilationError(pathname)
      if (compilationErr) {
        res.statusCode = 500
        return this.renderErrorToHTML(compilationErr, req, res, pathname, query)
      }
    }

    try {
      const out = await renderToHTML(req, res, pathname, query, this.renderOpts)
      return out
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
      const compilationErr = await this.getCompilationError(pathname)
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
      resolved.indexOf(join(this.distDir) + sep) !== 0 &&
      resolved.indexOf(join(this.dir, 'static') + sep) !== 0
    ) {
      // Seems like the user is trying to traverse the filesystem.
      return false
    }

    return true
  }

  readBuildId (dev) {
    if (dev) {
      return 'development'
    }
    const buildIdPath = join(this.distDir, BUILD_ID_FILE)
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

    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
    return true
  }

  async getCompilationError (page) {
    if (!this.hotReloader) return

    const errors = await this.hotReloader.getCompilationErrors(page)
    if (errors.length === 0) return

    // Return the very first error we found.
    return errors[0]
  }

  send404 (res) {
    res.statusCode = 404
    res.end('404 - Not Found')
  }
}
