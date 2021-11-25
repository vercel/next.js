import escapeRegexp from 'next/dist/compiled/escape-string-regexp'

import { NextRequest } from '../../../../server/web/spec-extension/request'
import { getPageHandler } from '../next-serverless-loader/page-handler'
import { isDynamicRoute } from '../../../../shared/lib/router/utils'
import { __ApiPreviewProps } from '../../../../server/api-utils'
import {
  WebIncomingMessage,
  WebServerResponse,
} from '../../../../server/web/http-adapter'

export function getRender({
  App,
  Document,
  pageMod,
  errorMod,
  rscManifest,
  buildManifest,
  reactLoadableManifest,
  isServerComponent,
  restRenderOpts,
}: {
  App: any
  Document: any
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
    const url = request.nextUrl
    const { pathname, searchParams } = url

    const query = Object.fromEntries(searchParams)

    // Preflight request
    if (request.method === 'HEAD') {
      return new Response('OK.', {
        headers: { 'x-middleware-ssr': '1' },
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
      Document,
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
      documentModule: { default: Document },
      errorModule: errorMod,
      // notFoundModule: ${
      //   absolute404Path
      //     ? `require(${stringifyRequest(this, absolute404Path)})`
      //     : undefined
      // },
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

      // rewrites: combinedRewrites,
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

    const result = await pageHandler.renderReqToHTML(
      new WebIncomingMessage(request),
      new WebServerResponse(),
      'passthrough',
      {
        supportsDynamicHTML: true,
        ...renderOpts,
      }
    )

    const transformStream = new TransformStream()
    const writer = transformStream.writable.getWriter()
    const encoder = new TextEncoder()

    if (typeof result === 'string') {
      return new Response(result, {
        headers: { 'x-middleware-ssr': '1' },
        status: 200,
      })
    }

    if (!result || !result.html) {
      return new Response(
        'An error occurred while rendering ' + pathname + '.',
        {
          status: 500,
          headers: { 'x-middleware-ssr': '1' },
        }
      )
    }

    result.html.pipe({
      write: (str: string) => writer.write(encoder.encode(str)),
      end: () => writer.close(),
      // Not implemented: cork/uncork/on/removeListener
    } as any)

    return new Response(transformStream.readable, {
      headers: { 'x-middleware-ssr': '1' },
      status: 200,
    })
  }
}
