import escapeRegexp from 'next/dist/compiled/escape-string-regexp'

import { NextRequest } from '../../../../server/web/spec-extension/request'
import { getPageHandler } from '../next-serverless-loader/page-handler'
import { isDynamicRoute } from '../../../../shared/lib/router/utils'
import { __ApiPreviewProps } from '../../../../server/api-utils'
import {
  WebIncomingMessage,
  WebServerResponse,
} from '../../../../server/web/http-adapter'
import { renderToHTML } from '../../../../server/web/render'
import RenderResult from '../../../../server/render-result'

const createHeaders = (args?: any) => ({
  ...args,
  'x-middleware-ssr': '1',
})

export function getRender({
  App,
  documentMod,
  pageMod,
  errorMod,
  rscManifest,
  buildManifest,
  reactLoadableManifest,
  isServerComponent,
  restRenderOpts,
}: {
  App: any
  documentMod: any
  pageMod: any
  errorMod: any
  rscManifest: object
  buildManifest: any
  reactLoadableManifest: any
  isServerComponent: boolean
  restRenderOpts: any
}) {
  const { page, buildId, previewProps, runtimeConfig } = restRenderOpts

  const pageIsDynamicRoute = isDynamicRoute(page)
  const escapedBuildId = escapeRegexp(buildId)
  const encodedPreviewProps = JSON.parse(previewProps) as __ApiPreviewProps

  return async function render(request: NextRequest) {
    const { nextUrl: url } = request
    const { pathname, searchParams } = url

    const query = Object.fromEntries(searchParams)

    // Preflight request
    if (request.method === 'HEAD') {
      return new Response(null, {
        headers: createHeaders(),
      })
    }

    const renderServerComponentData = isServerComponent
      ? query.__flight__ !== undefined
      : false
    delete query.__flight__

    const renderOpts = {
      ...restRenderOpts,
      // Locales are not supported yet.
      // locales: i18n?.locales,
      // locale: detectedLocale,
      // defaultLocale,
      // domainLocales: i18n?.domains,
      dev: process.env.NODE_ENV !== 'production',
      App,
      Document: documentMod.default,
      buildManifest,
      Component: pageMod.default,
      pageConfig: pageMod.config || {},
      getStaticProps: pageMod.getStaticProps,
      getServerSideProps: pageMod.getServerSideProps,
      getStaticPaths: pageMod.getStaticPaths,
      reactLoadableManifest,
      env: process.env,
      supportsDynamicHTML: true,
      concurrentFeatures: true,
      renderServerComponentData,
      serverComponentManifest: isServerComponent ? rscManifest : null,
      ComponentMod: null,
    }

    const pageHandler = getPageHandler({
      pageModule: pageMod,
      pageComponent: pageMod.default,
      pageConfig: pageMod.config || {},
      appModule: App,
      documentModule: documentMod,
      errorModule: errorMod,
      pageGetStaticProps: pageMod.getStaticProps,
      pageGetStaticPaths: pageMod.getStaticPaths,
      pageGetServerSideProps: pageMod.getServerSideProps,

      assetPrefix: restRenderOpts.assetPrefix,
      canonicalBase: restRenderOpts.canonicalBase,
      generateEtags: restRenderOpts.generateEtags || false,
      poweredByHeader: restRenderOpts.poweredByHeader || false,

      runtimeConfig,
      buildManifest,
      reactLoadableManifest,

      // FIXME: implement rewrites
      rewrites: [],
      i18n: restRenderOpts.i18n,
      page,
      buildId,
      escapedBuildId: escapedBuildId,
      basePath: restRenderOpts.basePath,
      pageIsDynamic: pageIsDynamicRoute,
      encodedPreviewProps,
      distDir: restRenderOpts.distDir,
    })

    const req = new WebIncomingMessage(request)
    const res = new WebServerResponse()
    let result: null | string | RenderResult = null
    let statusCode = 200

    try {
      const rendered = await pageHandler.renderReqToHTML(
        req,
        res,
        'passthrough',
        {
          supportsDynamicHTML: true,
          ...renderOpts,
        }
      )
      if (typeof rendered === 'string') {
        result = rendered
      } else if (rendered) {
        result = rendered.html
      }
    } catch (err) {
      statusCode = 500
      try {
        result = await renderToHTML(
          req as any,
          { statusCode: 500, err } as any,
          '/_error',
          query,
          {
            ...renderOpts,
            Component: errorMod.default,
            getStaticProps: errorMod.getStaticProps,
            getServerSideProps: errorMod.getServerSideProps,
            getStaticPaths: errorMod.getStaticPaths,
          }
        )
      } catch (err2: any) {
        return new Response(
          (
            err2 || 'An error occurred while rendering ' + pathname + '.'
          ).toString(),
          {
            status: 500,
            headers: createHeaders(),
          }
        )
      }
    }

    const transformStream = new TransformStream()
    const writer = transformStream.writable.getWriter()
    const encoder = new TextEncoder()

    if (typeof result === 'string') {
      return new Response(result, {
        headers: createHeaders(),
        status: statusCode,
      })
    }

    if (!result) {
      return new Response(
        'An error occurred while rendering ' + pathname + '.',
        {
          status: 500,
          headers: createHeaders(),
        }
      )
    }

    result.pipe({
      write: (str: string) => writer.write(encoder.encode(str)),
      end: () => writer.close(),
      // Not implemented: cork/uncork/on/removeListener
    } as any)

    return new Response(transformStream.readable, {
      headers: createHeaders(),
      status: statusCode,
    })
  }
}
