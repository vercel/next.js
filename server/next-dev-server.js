import Server from './index'
import { join } from 'path'
import {
  renderErrorToHTML
} from './render'

export default class DevServer extends Server {
  async generateRoutes () {
    const routes = await super.generateRoutes()

    // In development we expose all compiled files for react-error-overlay's line show feature
    // We use unshift so that we're sure the routes is defined before Next's default routes
    routes.unshift({
      path: '/_next/development/:path*',
      fn: async (req, res, params) => {
        const p = join(this.distDir, ...(params.path || []))
        await this.serveStatic(req, res, p)
      }
    })

    // Makes `next export` exportPathMap work in development mode.
    // So that the user doesn't have to define a custom server reading the exportPathMap
    if (this.nextConfig.exportPathMap) {
      console.log('Defining routes from exportPathMap')
      const exportPathMap = await this.nextConfig.exportPathMap({}, {dev: true, dir: this.dir, outDir: null, distDir: this.distDir, buildId: this.buildId}) // In development we can't give a default path mapping
      for (const path in exportPathMap) {
        const {page, query = {}} = exportPathMap[path]

        // We use unshift so that we're sure the routes is defined before Next's default routes
        routes.unshift({
          path,
          fn: async (req, res, params, parsedUrl) => {
            const { query: urlQuery } = parsedUrl

            Object.keys(urlQuery)
              .filter(key => query[key] === undefined)
              .forEach(key => console.warn(`Url defines a query parameter '${key}' that is missing in exportPathMap`))

            const mergedQuery = {...urlQuery, ...query}

            await this.render(req, res, page, mergedQuery, parsedUrl)
          }
        })
      }
    }

    return routes
  }

  async renderToHTML (req, res, pathname, query) {
    if (this.dev) {
      const compilationErr = await this.getCompilationError(pathname)
      if (compilationErr) {
        res.statusCode = 500
        return this.renderErrorToHTML(compilationErr, req, res, pathname, query)
      }
    }

    return super.renderToHTML(req, res, pathname, query)
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
      return super.renderErrorToHTML(err, req, res, pathname, query)
    } catch (err2) {
      if (!this.quiet) console.error(err2)
      res.statusCode = 500
      return renderErrorToHTML(err2, req, res, pathname, query, this.renderOpts)
    }
  }

  setImmutableAssetCacheControl (res) {
    res.setHeader('Cache-Control', 'no-store, must-revalidate')
  }

  async getCompilationError (page) {
    if (!this.hotReloader) return

    const errors = await this.hotReloader.getCompilationErrors(page)
    if (errors.length === 0) return

    // Return the very first error we found.
    return errors[0]
  }
}
