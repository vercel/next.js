import type { WebNextRequest, WebNextResponse } from './base-http'
import type { RenderOpts } from './render'
import type RenderResult from './render-result'
import type { NextParsedUrlQuery } from './request-meta'
import type { Params } from './router'
import type { PayloadOptions } from './send-payload'
import type { Options } from './base-server'

import BaseServer from './base-server'
import { renderToHTML } from './render'
import { LoadComponentsReturnType } from './load-components'

export default class NextWebServer extends BaseServer {
  constructor(options: Options) {
    super(options)
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
    // @TODO
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
  protected getPagePath() {
    // @TODO
    return ''
  }
  protected getPublicDir() {
    // @TODO
    return ''
  }
  protected getBuildId() {
    // @TODO
    return ''
  }
  protected loadEnvConfig() {
    // @TODO
  }
  protected getHasStaticDir() {
    return false
  }
  protected async hasMiddleware() {
    return false
  }
  protected generateImageRoutes() {
    return []
  }
  protected generateStaticRotes() {
    return []
  }
  protected generateFsStaticRoutes() {
    return []
  }
  protected generatePublicRoutes() {
    return []
  }
  protected getMiddleware() {
    return []
  }
  protected generateCatchAllMiddlewareRoute() {
    return undefined
  }
  protected getFontManifest() {
    return undefined
  }
  protected getMiddlewareManifest() {
    return undefined
  }
  protected getPagesManifest() {
    // @TODO
    return {}
  }
  protected getFilesystemPaths() {
    return new Set<string>()
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
  protected async renderHTML(
    req: WebNextRequest,
    res: WebNextResponse,
    pathname: string,
    query: NextParsedUrlQuery,
    renderOpts: RenderOpts
  ): Promise<RenderResult | null> {
    return renderToHTML(
      {
        url: pathname,
        cookies: req.cookies,
        headers: req.headers,
      } as any,
      {} as any,
      pathname,
      query,
      { ...renderOpts, supportsDynamicHTML: true }
    )
  }
  protected async sendRenderResult(
    req: WebNextRequest,
    res: WebNextResponse,
    options: {
      result: RenderResult
      type: 'html' | 'json'
      generateEtags: boolean
      poweredByHeader: boolean
      options?: PayloadOptions | undefined
    }
  ): Promise<void> {
    // @TODO
    const writer = res.transformStream.writable.getWriter()
    const encoder = new TextEncoder()
    options.result.pipe({
      write: (str: string) => writer.write(encoder.encode(str)),
      end: () => writer.close(),
      // Not implemented: cork/uncork/on/removeListener
    } as any)
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
    // @TODO
    return {
      query: query || {},
      components: (globalThis as any)
        .__web_components as LoadComponentsReturnType,
    }
  }
}
