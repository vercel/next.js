import type { WebNextRequest, WebNextResponse } from './base-http'
import type { RenderOpts } from './render'
import type RenderResult from './render-result'
import type { NextParsedUrlQuery } from './request-meta'
import type { Params } from './router'
import type { PayloadOptions } from './send-payload'

import BaseServer from './base-server'
import { renderToHTML } from './render'
import { LoadComponentsReturnType } from './load-components'

export default class NextWebServer extends BaseServer {
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
    return (globalThis as any).__server_context.buildId
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
    return {
      [(globalThis as any).__current_route]: '',
    }
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
    _res: WebNextResponse,
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
      {
        ...renderOpts,
        supportsDynamicHTML: true,
        concurrentFeatures: true,
        disableOptimizedLoading: true,
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
    // @TODO
    const writer = res.transformStream.writable.getWriter()
    const encoder = new TextEncoder()
    options.result.pipe({
      write: (str: string) => writer.write(encoder.encode(str)),
      end: () => writer.close(),
      // Not implemented: cork/uncork/on/removeListener
    } as any)

    // To prevent Safari's bfcache caching the "shell", we have to add the
    // `no-cache` header to document responses.
    res.setHeader(
      'Cache-Control',
      'no-cache, no-store, max-age=0, must-revalidate'
    )
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
    if (pathname === (globalThis as any).__current_route) {
      return {
        query: {
          ...(query || {}),
          ...(params || {}),
        },
        components: (globalThis as any)
          .__server_context as LoadComponentsReturnType,
      }
    }

    const { errorMod, error500Mod } = (globalThis as any).__server_context

    // If there is a custom 500 page.
    if (pathname === '/500' && error500Mod) {
      return {
        query: {
          ...(query || {}),
          ...(params || {}),
        },
        components: {
          ...(globalThis as any).__server_context,
          Component: error500Mod.default,
          getStaticProps: error500Mod.getStaticProps,
          getServerSideProps: error500Mod.getServerSideProps,
          getStaticPaths: error500Mod.getStaticPaths,
        } as LoadComponentsReturnType,
      }
    }

    if (pathname === '/_error') {
      return {
        query: {
          ...(query || {}),
          ...(params || {}),
        },
        components: {
          ...(globalThis as any).__server_context,
          Component: errorMod.default,
          getStaticProps: errorMod.getStaticProps,
          getServerSideProps: errorMod.getServerSideProps,
          getStaticPaths: errorMod.getStaticPaths,
        } as LoadComponentsReturnType,
      }
    }

    return null
  }
}
