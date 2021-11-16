import { NextRequest } from '../../../../server/web/spec-extension/request'
import { renderToHTML } from '../../../../server/web/render'
import RenderResult from '../../../../server/render-result'

export function getRender({
  App,
  Document,
  Component,
  ErrorPage,
  config,
  getStaticProps,
  getServerSideProps,
  getStaticPaths,
  rscManifest,
  buildManifest,
  reactLoadableManifest,
  isServerComponent,
  restRenderOpts,
}: {
  App: any
  Document: any
  Component: React.ComponentType
  ErrorPage: any
  config: any
  rscManifest: object
  buildManifest: any
  reactLoadableManifest: any
  getStaticProps: any
  getServerSideProps: any
  getStaticPaths: any
  isServerComponent: boolean
  restRenderOpts: any
}) {
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

    const req = { url: pathname }
    const renderOpts = {
      ...restRenderOpts,
      Component,
      pageConfig: config || {},
      // Locales are not supported yet.
      // locales: i18n?.locales,
      // locale: detectedLocale,
      // defaultLocale,
      // domainLocales: i18n?.domains,
      dev: process.env.NODE_ENV !== 'production',
      App,
      Document,
      buildManifest,
      getStaticProps,
      getServerSideProps,
      getStaticPaths,
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
    } catch (err) {
      const errorRes = { statusCode: 500, err }
      try {
        result = await renderToHTML(
          req as any,
          errorRes as any,
          pathname,
          query,
          { ...renderOpts, Component: ErrorPage }
        )
      } catch (err: any) {
        return new Response(
          (
            err || 'An error occurred while rendering ' + pathname + '.'
          ).toString(),
          {
            status: 500,
            headers: { 'x-middleware-ssr': '1' },
          }
        )
      }
    }

    if (!result) {
      return new Response(
        'An error occurred while rendering ' + pathname + '.',
        {
          status: 500,
          headers: { 'x-middleware-ssr': '1' },
        }
      )
    }

    result.pipe({
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
