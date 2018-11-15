/* eslint-disable import/first, no-return-await */
import { resolve, join, sep } from 'path'
import { parse as parseUrl } from 'url'
import { parse as parseQs } from 'querystring'
import fs from 'fs'
import {
  renderToHTML,
  renderErrorToHTML,
  sendHTML,
  serveStatic
} from './render'
import Router, {route} from './router'
import { isInternalUrl } from './utils'
import loadConfig from 'next-server/next-config'
import {PHASE_PRODUCTION_SERVER, BLOCKED_PAGES, BUILD_ID_FILE, CLIENT_STATIC_FILES_PATH, CLIENT_STATIC_FILES_RUNTIME} from 'next-server/constants'
import * as asset from '../lib/asset'
import * as envConfig from '../lib/runtime-config'
import { isResSent } from '../lib/utils'

export default class Server {
  constructor ({ dir = '.', staticMarkup = false, quiet = false, conf = null } = {}) {
    this.dir = resolve(dir)
    this.quiet = quiet
    const phase = this.currentPhase()
    this.nextConfig = loadConfig(phase, this.dir, conf)
    this.distDir = join(this.dir, this.nextConfig.distDir)

    // Only serverRuntimeConfig needs the default
    // publicRuntimeConfig gets it's default in client/index.js
    const {serverRuntimeConfig = {}, publicRuntimeConfig, assetPrefix, generateEtags} = this.nextConfig

    this.buildId = this.readBuildId()
    this.renderOpts = {
      staticMarkup,
      distDir: this.distDir,
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

    const routes = this.generateRoutes()
    this.router = new Router(routes)
    this.setAssetPrefix(assetPrefix)
  }

  currentPhase () {
    return PHASE_PRODUCTION_SERVER
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
        res.end('Internal Server Error')
      })
  }

  getRequestHandler () {
    return this.handleRequest.bind(this)
  }

  setAssetPrefix (prefix) {
    this.renderOpts.assetPrefix = prefix ? prefix.replace(/\/$/, '') : ''
    asset.setAssetPrefix(this.renderOpts.assetPrefix)
  }

  // Backwards compatibility
  async prepare () {}

  // Backwards compatibility
  async close () {}

  setImmutableAssetCacheControl (res) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
  }

  generateRoutes () {
    const routes = [
      {
        match: route('/_next/static/:path*'),
        fn: async (req, res, params) => {
          // The commons folder holds commonschunk files
          // The chunks folder holds dynamic entries
          // The buildId folder holds pages and potentially other assets. As buildId changes per build it can be long-term cached.
          if (params.path[0] === CLIENT_STATIC_FILES_RUNTIME || params.path[0] === 'chunks' || params.path[0] === this.buildId) {
            this.setImmutableAssetCacheControl(res)
          }
          const p = join(this.distDir, CLIENT_STATIC_FILES_PATH, ...(params.path || []))
          await this.serveStatic(req, res, p)
        }
      },
      {
        match: route('/_next/:path*'),
        // This path is needed because `render()` does a check for `/_next` and the calls the routing again
        fn: async (req, res, params, parsedUrl) => {
          await this.render404(req, res, parsedUrl)
        }
      },
      {
        // It's very important to keep this route's param optional.
        // (but it should support as many params as needed, separated by '/')
        // Otherwise this will lead to a pretty simple DOS attack.
        // See more: https://github.com/zeit/next.js/issues/2617
        match: route('/static/:path*'),
        fn: async (req, res, params) => {
          const p = join(this.dir, 'static', ...(params.path || []))
          await this.serveStatic(req, res, p)
        }
      }
    ]

    if (this.nextConfig.useFileSystemPublicRoutes) {
      // It's very important to keep this route's param optional.
      // (but it should support as many params as needed, separated by '/')
      // Otherwise this will lead to a pretty simple DOS attack.
      // See more: https://github.com/zeit/next.js/issues/2617
      routes.push({
        match: route('/:path*'),
        fn: async (req, res, params, parsedUrl) => {
          const { pathname, query } = parsedUrl
          await this.render(req, res, pathname, query, parsedUrl)
        }
      })
    }

    return routes
  }

  async run (req, res, parsedUrl) {
    try {
      const fn = this.router.match(req, res, parsedUrl)
      if (fn) {
        await fn()
        return
      }
    } catch (err) {
      if (err.code === 'DECODE_FAILED') {
        res.statusCode = 400
        return this.renderError(null, req, res, '/_error', {})
      }
      throw err
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      await this.render404(req, res, parsedUrl)
    } else {
      res.statusCode = 501
      res.end('Not Implemented')
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
      res.setHeader('X-Powered-By', 'Next.js ' + process.env.NEXT_VERSION)
    }
    return sendHTML(req, res, html, req.method, this.renderOpts)
  }

  async renderToHTML (req, res, pathname, query) {
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
    res.setHeader('Cache-Control', 'no-cache, no-store, max-age=0, must-revalidate')
    const html = await this.renderErrorToHTML(err, req, res, pathname, query)
    return sendHTML(req, res, html, req.method, this.renderOpts)
  }

  async renderErrorToHTML (err, req, res, pathname, query) {
    return renderErrorToHTML(err, req, res, pathname, query, this.renderOpts)
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

  readBuildId () {
    if (!fs.existsSync(resolve(this.distDir, BUILD_ID_FILE))) {
      throw new Error(`Could not find a valid build in the '${this.distDir}' directory! Try building your app with 'next build' before starting the server.`)
    }
    const buildIdPath = join(this.distDir, BUILD_ID_FILE)
    const buildId = fs.readFileSync(buildIdPath, 'utf8')
    return buildId.trim()
  }
}
