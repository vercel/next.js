import { resolve, join } from 'path'
import fs from 'fs'

import getConfig from './config'

export default class Server {
  constructor ({ dir = '.', dev = false, quiet = false, conf = null } = {}) {
    this.dir = resolve(dir)
    this.dev = dev
    this.quiet = quiet
    this.config = getConfig(this.dir, conf)
    this.hotReloader = dev ? this.getHotReloader() : null
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
  }

  getHotReloader () {
    const { HotReloader } = require('@healthline/six-million')
    const createWebpack = require('./webpack').default
    return new HotReloader(this.dir, createWebpack, { query: this.quiet, config: this.config })
  }

  async prepare () {
    if (this.hotReloader) {
      await this.hotReloader.start(['_error', '_document', '_amp'])
    }
  }

  async close () {
    if (this.hotReloader) {
      await this.hotReloader.stop()
    }
  }

  defineRoutes (server) {
    if (this.hotReloader) {
      server.route({
        method: 'GET',
        path: '/_next/webpack-hmr',
        handler: async ({ raw, url }, h) => {
          const { req, res } = raw
          res.statusCode = 200
          await this.hotReloader.run(req, res)
          return h.close
        }
      })
    }

    server.route({
      method: 'GET',
      path: '/_next/{path*}',
      handler: {
        directory: {
          path: '.next/bundles/'
        }
      }
    })
    server.route({
      method: 'GET',
      path: '/_static/{path*}',
      handler: {
        directory: {
          path: '.next/static/'
        }
      }
    })
  }

  readBuildId () {
    const buildIdPath = join(this.dir, '.next', 'BUILD_ID')
    return fs.readFileSync(buildIdPath, 'utf8').trim()
  }

  readEntrypoints () {
    const buildIdPath = join(this.dir, '.next', 'webpack-entrypoints.json')
    const entrypoints = JSON.parse(fs.readFileSync(buildIdPath, 'utf8'))
    if (!entrypoints[process.env.SITE || 'default']) {
      throw new Error(`No entry points defined for SITE ${process.env.SITE}`)
    }
    const current = entrypoints[process.env.SITE || 'default']
    const legacy = entrypoints[`${process.env.SITE}-legacy`]

    if (legacy) {
      const ret = {}
      Object.keys(current).forEach((path) => {
        ret[path] = {
          chunks: current[path].chunks.concat(legacy[path].chunks)
        }
      })
      return ret
    }

    return current
  }

  async getCompilationError () {
    if (!this.hotReloader) return

    const errors = await this.hotReloader.getCompilationErrors()
    if (!errors.size) return

    // Return the very first error we found.
    return Array.from(errors.values())[0][0]
  }
}
