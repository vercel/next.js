import type { WebNextRequest, WebNextResponse } from './base-http/web'
import type { RenderOpts } from './render'
import type RenderResult from './render-result'
import type { NextParsedUrlQuery, NextUrlWithParsedQuery } from './request-meta'
import type { Params } from '../shared/lib/router/utils/route-matcher'
import type { PayloadOptions } from './send-payload'
import type { LoadComponentsReturnType } from './load-components'
import type { Options } from './base-server'
import type { DynamicRoutes, PageChecker, Route } from './router'
import type { NextConfig } from '../types'

import BaseServer, { NoFallbackError } from './base-server'
import { renderToHTML } from './render'
import { byteLength } from './api-utils/web'
import { generateETag } from './lib/etag'
import { addRequestMeta } from './request-meta'
import WebResponseCache from './response-cache/web'
import { getPathMatch } from '../shared/lib/router/utils/path-match'
import { removeTrailingSlash } from '../shared/lib/router/utils/remove-trailing-slash'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'

interface WebServerOptions extends Options {
  webServerConfig: {
    page: string
    loadComponent: (
      pathname: string
    ) => Promise<LoadComponentsReturnType | null>
    extendRenderOpts: Partial<BaseServer['renderOpts']> &
      Pick<BaseServer['renderOpts'], 'buildId'>
  }
}

export default class NextWebServer extends BaseServer<WebServerOptions> {
  constructor(options: WebServerOptions) {
    super(options)

    // Extend `renderOpts`.
    Object.assign(this.renderOpts, options.webServerConfig.extendRenderOpts)
  }

  protected generateRewrites() {
    // @TODO: assuming minimal mode right now
    return {
      beforeFiles: [],
      afterFiles: [],
      fallback: [],
    }
  }
  protected handleCompression() {
    // For the web server layer, compression is automatically handled by the
    // upstream proxy (edge runtime or node server) and we can simply skip here.
  }
  protected getRoutesManifest() {
    return {
      headers: [],
      rewrites: {
        fallback: [],
        afterFiles: [],
        beforeFiles: [],
      },
      redirects: [],
    }
  }

  // Edge API requests are handled separately in minimal mode.
  protected async handleApiRequest() {
    return false
  }

  protected getPublicDir() {
    // Public files are not handled by the web server.
    return ''
  }
  protected getBuildId() {
    return this.serverOptions.webServerConfig.extendRenderOpts.buildId
  }
  protected loadEnvConfig() {
    // The web server does not need to load the env config. This is done by the
    // runtime already.
  }
  protected getHasStaticDir() {
    return false
  }

  protected generateRoutes(): {
    headers: Route[]
    rewrites: {
      beforeFiles: Route[]
      afterFiles: Route[]
      fallback: Route[]
    }
    fsRoutes: Route[]
    redirects: Route[]
    catchAllRoute: Route
    catchAllMiddleware: Route[]
    pageChecker: PageChecker
    useFileSystemPublicRoutes: boolean
    dynamicRoutes: DynamicRoutes | undefined
    nextConfig: NextConfig
  } {
    const fsRoutes: Route[] = [
      this.generateDataCatchallRoute(),
      {
        match: getPathMatch('/_next/:path*'),
        type: 'route',
        name: '_next catchall',
        // This path is needed because `render()` does a check for `/_next` and the calls the routing again
        fn: async (req, res, _params, parsedUrl) => {
          await this.render404(req, res, parsedUrl)
          return {
            finished: true,
          }
        },
      },
    ]

    const catchAllRoute: Route = {
      match: getPathMatch('/:path*'),
      type: 'route',
      matchesLocale: true,
      name: 'Catchall render',
      fn: async (req, res, _params, parsedUrl) => {
        let { pathname, query } = parsedUrl
        if (!pathname) {
          throw new Error('pathname is undefined')
        }

        // next.js core assumes page path without trailing slash
        pathname = removeTrailingSlash(pathname)

        if (this.nextConfig.i18n) {
          const localePathResult = normalizeLocalePath(
            pathname,
            this.nextConfig.i18n?.locales
          )

          if (localePathResult.detectedLocale) {
            pathname = localePathResult.pathname
            parsedUrl.query.__nextLocale = localePathResult.detectedLocale
          }
        }
        const bubbleNoFallback = !!query._nextBubbleNoFallback

        if (pathname === '/api' || pathname.startsWith('/api/')) {
          delete query._nextBubbleNoFallback
        }

        try {
          await this.render(req, res, pathname, query, parsedUrl, true)

          return {
            finished: true,
          }
        } catch (err) {
          if (err instanceof NoFallbackError && bubbleNoFallback) {
            return {
              finished: false,
            }
          }
          throw err
        }
      },
    }

    return {
      headers: [],
      fsRoutes,
      rewrites: {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
      redirects: [],
      catchAllRoute,
      catchAllMiddleware: [],
      useFileSystemPublicRoutes: this.nextConfig.useFileSystemPublicRoutes,
      dynamicRoutes: this.dynamicRoutes,
      pageChecker: this.hasPage.bind(this),
      nextConfig: this.nextConfig,
    }
  }

  protected async hasPage() {
    return false
  }

  protected getFontManifest() {
    return undefined
  }
  protected getPagesManifest() {
    return {
      [this.serverOptions.webServerConfig.page]: '',
    }
  }
  protected getAppPathsManifest() {
    return {
      [this.serverOptions.webServerConfig.page]: '',
    }
  }
  protected getFilesystemPaths() {
    return new Set<string>()
  }
  protected attachRequestMeta(
    req: WebNextRequest,
    parsedUrl: NextUrlWithParsedQuery
  ) {
    addRequestMeta(req, '__NEXT_INIT_QUERY', { ...parsedUrl.query })
  }
  protected getPrerenderManifest() {
    return {
      version: 3 as const,
      routes: {},
      dynamicRoutes: {},
      notFoundRoutes: [],
      preview: {
        previewModeId: '',
        previewModeSigningKey: '',
        previewModeEncryptionKey: '',
      },
    }
  }
  protected getResponseCache() {
    return new WebResponseCache(this.minimalMode)
  }
  protected getServerComponentManifest() {
    // @TODO: Need to return `extendRenderOpts.serverComponentManifest` here.
    return undefined
  }
  protected async renderHTML(
    req: WebNextRequest,
    _res: WebNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: RenderOpts
  ): Promise<RenderResult | null> {
    return renderToHTML(
      {
        url: req.url,
        cookies: req.cookies,
        headers: req.headers,
      } as any,
      {} as any,
      pathname,
      query,
      {
        ...renderOpts,
        disableOptimizedLoading: true,
        runtime: 'experimental-edge',
      }
    )
  }
  protected async sendRenderResult(
    _req: WebNextRequest,
    res: WebNextResponse,
    options: {
      result: RenderResult
      type: 'html' | 'json'
      generateEtags: boolean
      poweredByHeader: boolean
      options?: PayloadOptions | undefined
    }
  ): Promise<void> {
    res.setHeader('X-Edge-Runtime', '1')

    // Add necessary headers.
    // @TODO: Share the isomorphic logic with server/send-payload.ts.
    if (options.poweredByHeader && options.type === 'html') {
      res.setHeader('X-Powered-By', 'Next.js')
    }
    if (!res.getHeader('Content-Type')) {
      res.setHeader(
        'Content-Type',
        options.type === 'json'
          ? 'application/json'
          : 'text/html; charset=utf-8'
      )
    }

    if (options.result.isDynamic()) {
      const writer = res.transformStream.writable.getWriter()
      options.result.pipe({
        write: (chunk: Uint8Array) => writer.write(chunk),
        end: () => writer.close(),
        destroy: (err: Error) => writer.abort(err),
        cork: () => {},
        uncork: () => {},
        // Not implemented: on/removeListener
      } as any)
    } else {
      const payload = await options.result.toUnchunkedString()
      res.setHeader('Content-Length', String(byteLength(payload)))
      if (options.generateEtags) {
        res.setHeader('ETag', generateETag(payload))
      }
      res.body(payload)
    }

    res.send()
  }
  protected async runApi() {
    // @TODO
    return true
  }
  protected async findPageComponents(
    pathname: string,
    query?: NextParsedUrlQuery,
    params?: Params | null
  ) {
    const result = await this.serverOptions.webServerConfig.loadComponent(
      pathname
    )
    if (!result) return null

    return {
      query: {
        ...(query || {}),
        ...(params || {}),
      },
      components: result,
    }
  }
}
