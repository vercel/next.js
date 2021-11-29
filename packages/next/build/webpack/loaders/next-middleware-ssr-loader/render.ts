import { NextRequest } from '../../../../server/web/spec-extension/request'
import { renderToHTML } from '../../../../server/web/render'
import RenderResult from '../../../../server/render-result'
import { toNodeHeaders } from '../../../../server/web/utils'

const createHeaders = (args?: any) => ({
  ...args,
  'x-middleware-ssr': '1',
})

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
  return async function render(request: NextRequest) {
    const { nextUrl: url, cookies, headers } = request
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

    const req = {
      url: pathname,
      cookies,
      headers: toNodeHeaders(headers),
    }
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

    const transformStream = new TransformStream()
    const writer = transformStream.writable.getWriter()
    const encoder = new TextEncoder()

    let result: RenderResult | null
    try {
      result = await renderToHTML(
        req as any,
        {} as any,
        pathname,
        query,
        renderOpts
      )
    } catch (err: any) {
      const errorRes = { statusCode: 500, err }
      try {
        result = await renderToHTML(
          req as any,
          errorRes as any,
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
      status: 200,
    })
  }
}
