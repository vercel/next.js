import type { Params, Route } from './router'
import type { CacheFs } from '../shared/lib/utils'

import fs from 'fs'
import { join, relative } from 'path'

import { IncomingMessage, ServerResponse } from 'http'
import { PAGES_MANIFEST, BUILD_ID_FILE } from '../shared/lib/constants'
import { PagesManifest } from '../build/webpack/plugins/pages-manifest-plugin'
import { recursiveReadDirSync } from './lib/recursive-readdir-sync'
import { route } from './router'
import { format as formatUrl } from 'url'
import compression from 'next/dist/compiled/compression'
import Proxy from 'next/dist/compiled/http-proxy'
import { UrlWithParsedQuery } from 'url'

import BaseServer, { prepareServerlessUrl, stringifyQuery } from './base-server'
import {
  BaseNextRequest,
  BaseNextResponse,
  NodeNextRequest,
  NodeNextResponse,
} from './base-http'
import renderResult from './render-result'
import { PayloadOptions, sendRenderResult } from './send-payload'
import { serveStatic } from './serve-static'
import { ParsedUrlQuery } from 'querystring'
import { apiResolver } from './api-utils'
import { RenderOpts, renderToHTML } from './render'
import { NextParsedUrlQuery, NextUrlWithParsedQuery } from './request-meta'
import RenderResult from './render-result'
import { ParsedUrl } from '../shared/lib/router/utils/parse-url'

export * from './base-server'

type ExpressMiddleware = (
  req: IncomingMessage,
  res: ServerResponse,
  next: (err?: Error) => void
) => void

export interface NodeRequestHandler {
  (
    req: IncomingMessage | BaseNextRequest,
    res: ServerResponse | BaseNextResponse,
    parsedUrl?: NextUrlWithParsedQuery | undefined
  ): Promise<void>
}

export default class NextNodeServer extends BaseServer {
  private compression =
    this.nextConfig.compress && this.nextConfig.target === 'server'
      ? (compression() as ExpressMiddleware)
      : undefined

  protected getHasStaticDir(): boolean {
    return fs.existsSync(join(this.dir, 'static'))
  }

  protected getPagesManifest(): PagesManifest | undefined {
    const pagesManifestPath = join(this.serverBuildDir, PAGES_MANIFEST)
    return require(pagesManifestPath)
  }

  protected getBuildId(): string {
    const buildIdFile = join(this.distDir, BUILD_ID_FILE)
    try {
      return fs.readFileSync(buildIdFile, 'utf8').trim()
    } catch (err) {
      if (!fs.existsSync(buildIdFile)) {
        throw new Error(
          `Could not find a production build in the '${this.distDir}' directory. Try building your app with 'next build' before starting the production server. https://nextjs.org/docs/messages/production-start-no-build-id`
        )
      }

      throw err
    }
  }

  protected generatePublicRoutes(): Route[] {
    if (!fs.existsSync(this.publicDir)) return []

    const publicFiles = new Set(
      recursiveReadDirSync(this.publicDir).map((p) =>
        encodeURI(p.replace(/\\/g, '/'))
      )
    )

    return [
      {
        match: route('/:path*'),
        name: 'public folder catchall',
        fn: async (req, res, params, parsedUrl) => {
          const pathParts: string[] = params.path || []
          const { basePath } = this.nextConfig

          // if basePath is defined require it be present
          if (basePath) {
            const basePathParts = basePath.split('/')
            // remove first empty value
            basePathParts.shift()

            if (
              !basePathParts.every((part: string, idx: number) => {
                return part === pathParts[idx]
              })
            ) {
              return { finished: false }
            }

            pathParts.splice(0, basePathParts.length)
          }

          let path = `/${pathParts.join('/')}`

          if (!publicFiles.has(path)) {
            // In `next-dev-server.ts`, we ensure encoded paths match
            // decoded paths on the filesystem. So we need do the
            // opposite here: make sure decoded paths match encoded.
            path = encodeURI(path)
          }

          if (publicFiles.has(path)) {
            await this.serveStatic(
              req,
              res,
              join(this.publicDir, ...pathParts),
              parsedUrl
            )
            return {
              finished: true,
            }
          }
          return {
            finished: false,
          }
        },
      } as Route,
    ]
  }

  private _validFilesystemPathSet: Set<string> | null = null
  protected getFilesystemPaths(): Set<string> {
    if (this._validFilesystemPathSet) {
      return this._validFilesystemPathSet
    }

    const pathUserFilesStatic = join(this.dir, 'static')
    let userFilesStatic: string[] = []
    if (this.hasStaticDir && fs.existsSync(pathUserFilesStatic)) {
      userFilesStatic = recursiveReadDirSync(pathUserFilesStatic).map((f) =>
        join('.', 'static', f)
      )
    }

    let userFilesPublic: string[] = []
    if (this.publicDir && fs.existsSync(this.publicDir)) {
      userFilesPublic = recursiveReadDirSync(this.publicDir).map((f) =>
        join('.', 'public', f)
      )
    }

    let nextFilesStatic: string[] = []

    nextFilesStatic =
      !this.minimalMode && fs.existsSync(join(this.distDir, 'static'))
        ? recursiveReadDirSync(join(this.distDir, 'static')).map((f) =>
            join('.', relative(this.dir, this.distDir), 'static', f)
          )
        : []

    return (this._validFilesystemPathSet = new Set<string>([
      ...nextFilesStatic,
      ...userFilesPublic,
      ...userFilesStatic,
    ]))
  }

  protected sendRenderResult(
    req: NodeNextRequest,
    res: NodeNextResponse,
    options: {
      result: renderResult
      type: 'html' | 'json'
      generateEtags: boolean
      poweredByHeader: boolean
      options?: PayloadOptions | undefined
    }
  ): Promise<void> {
    return sendRenderResult({
      req: req.req,
      res: res.res,
      ...options,
    })
  }

  protected sendStatic(
    req: NodeNextRequest,
    res: NodeNextResponse,
    path: string
  ): Promise<void> {
    return serveStatic(req.req, res.res, path)
  }

  protected handleCompression(
    req: NodeNextRequest,
    res: NodeNextResponse
  ): void {
    if (this.compression) {
      this.compression(req.req, res.res, () => {})
    }
  }

  protected async proxyRequest(
    req: NodeNextRequest,
    res: NodeNextResponse,
    parsedUrl: ParsedUrl
  ) {
    const { query } = parsedUrl
    delete (parsedUrl as any).query
    parsedUrl.search = stringifyQuery(req, query)

    const target = formatUrl(parsedUrl)
    const proxy = new Proxy({
      target,
      changeOrigin: true,
      ignorePath: true,
      xfwd: true,
      proxyTimeout: 30_000, // limit proxying to 30 seconds
    })

    await new Promise((proxyResolve, proxyReject) => {
      let finished = false

      proxy.on('proxyReq', (proxyReq) => {
        proxyReq.on('close', () => {
          if (!finished) {
            finished = true
            proxyResolve(true)
          }
        })
      })
      proxy.on('error', (err) => {
        if (!finished) {
          finished = true
          proxyReject(err)
        }
      })
      proxy.web(req.req, res.res)
    })

    return {
      finished: true,
    }
  }

  protected async runApi(
    req: NodeNextRequest,
    res: NodeNextResponse,
    query: ParsedUrlQuery,
    params: Params | false,
    page: string,
    builtPagePath: string
  ): Promise<boolean> {
    const pageModule = await require(builtPagePath)
    query = { ...query, ...params }

    delete query.__nextLocale
    delete query.__nextDefaultLocale

    if (!this.renderOpts.dev && this._isLikeServerless) {
      if (typeof pageModule.default === 'function') {
        prepareServerlessUrl(req, query)
        await pageModule.default(req, res)
        return true
      }
    }

    await apiResolver(
      req.req,
      res.res,
      query,
      pageModule,
      this.renderOpts.previewProps,
      this.minimalMode,
      this.renderOpts.dev,
      page
    )
    return true
  }

  protected async renderHTML(
    req: NodeNextRequest,
    res: NodeNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: RenderOpts
  ): Promise<RenderResult | null> {
    return renderToHTML(req.req, res.res, pathname, query, renderOpts)
  }

  protected streamResponseChunk(res: NodeNextResponse, chunk: any) {
    res.res.write(chunk)
  }

  protected async imageOptimizer(
    req: NodeNextRequest,
    res: NodeNextResponse,
    parsedUrl: UrlWithParsedQuery
  ): Promise<{ finished: boolean }> {
    const { imageOptimizer } =
      require('./image-optimizer') as typeof import('./image-optimizer')

    return imageOptimizer(
      req.req,
      res.res,
      parsedUrl,
      this.nextConfig,
      this.distDir,
      () => this.render404(req, res, parsedUrl),
      (newReq, newRes, newParsedUrl) =>
        this.getRequestHandler()(
          new NodeNextRequest(newReq),
          new NodeNextResponse(newRes),
          newParsedUrl
        ),
      this.renderOpts.dev
    )
  }

  protected getCacheFilesystem(): CacheFs {
    return {
      readFile: (f) => fs.promises.readFile(f, 'utf8'),
      readFileSync: (f) => fs.readFileSync(f, 'utf8'),
      writeFile: (f, d) => fs.promises.writeFile(f, d, 'utf8'),
      mkdir: (dir) => fs.promises.mkdir(dir, { recursive: true }),
      stat: (f) => fs.promises.stat(f),
    }
  }

  private normalizeReq(
    req: BaseNextRequest | IncomingMessage
  ): BaseNextRequest {
    return req instanceof IncomingMessage ? new NodeNextRequest(req) : req
  }

  private normalizeRes(
    res: BaseNextResponse | ServerResponse
  ): BaseNextResponse {
    return res instanceof ServerResponse ? new NodeNextResponse(res) : res
  }

  public getRequestHandler(): NodeRequestHandler {
    const handler = super.getRequestHandler()
    return async (req, res, parsedUrl) => {
      return handler(this.normalizeReq(req), this.normalizeRes(res), parsedUrl)
    }
  }

  public async render(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: NextParsedUrlQuery,
    parsedUrl?: NextUrlWithParsedQuery
  ): Promise<void> {
    return super.render(
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query,
      parsedUrl
    )
  }

  public async renderToHTML(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: ParsedUrlQuery
  ): Promise<string | null> {
    return super.renderToHTML(
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query
    )
  }

  public async renderError(
    err: Error | null,
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: NextParsedUrlQuery,
    setHeaders?: boolean
  ): Promise<void> {
    return super.renderError(
      err,
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query,
      setHeaders
    )
  }

  public async renderErrorToHTML(
    err: Error | null,
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    pathname: string,
    query?: ParsedUrlQuery
  ): Promise<string | null> {
    return super.renderErrorToHTML(
      err,
      this.normalizeReq(req),
      this.normalizeRes(res),
      pathname,
      query
    )
  }

  public async render404(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    parsedUrl?: NextUrlWithParsedQuery,
    setHeaders?: boolean
  ): Promise<void> {
    return super.render404(
      this.normalizeReq(req),
      this.normalizeRes(res),
      parsedUrl,
      setHeaders
    )
  }

  public async serveStatic(
    req: BaseNextRequest | IncomingMessage,
    res: BaseNextResponse | ServerResponse,
    path: string,
    parsedUrl?: UrlWithParsedQuery
  ): Promise<void> {
    return super.serveStatic(
      this.normalizeReq(req),
      this.normalizeRes(res),
      path,
      parsedUrl
    )
  }
}
