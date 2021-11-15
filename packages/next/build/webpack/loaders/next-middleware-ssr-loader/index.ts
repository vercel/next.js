import { stringifyRequest } from '../../stringify-request'

export default async function middlewareRSCLoader(this: any) {
  const {
    absolutePagePath,
    absoluteAppPath,
    absoluteDocumentPath,
    absoluteErrorPath,
    basePath,
    isServerComponent: isServerComponentQuery,
    assetPrefix,
    buildId,
  } = this.getOptions()

  const isServerComponent = isServerComponentQuery === 'true'
  const stringifiedAbsolutePagePath = stringifyRequest(this, absolutePagePath)
  const stringifiedAbsoluteAppPath = stringifyRequest(this, absoluteAppPath)
  const stringifiedAbsoluteErrorPath = stringifyRequest(this, absoluteErrorPath)
  const stringified500PagePath = stringifyRequest(this, './pages/500')
  const stringifiedAbsoluteDocumentPath = stringifyRequest(
    this,
    absoluteDocumentPath
  )

  const transformed = `
        import { adapter } from 'next/dist/server/web/adapter'
        import { RouterContext } from 'next/dist/shared/lib/router-context'
        import { renderToHTML } from 'next/dist/server/web/render'

        import App from ${stringifiedAbsoluteAppPath}
        import Document from ${stringifiedAbsoluteDocumentPath}

        let ErrorPage
        try {
          ErrorPage = require(${stringified500PagePath}).default
        } catch (_) {
          ErrorPage = require(${stringifiedAbsoluteErrorPath}).default
        }

        const {
          default: Page,
          config,
          getStaticProps,
          getServerSideProps,
          getStaticPaths
        } = require(${stringifiedAbsolutePagePath})

        const buildManifest = self.__BUILD_MANIFEST
        const reactLoadableManifest = self.__REACT_LOADABLE_MANIFEST
        const rscManifest = self.__RSC_MANIFEST

        if (typeof Page !== 'function') {
          throw new Error('Your page must export a \`default\` component')
        }

        const Component = Page

        async function render(request) {
          const url = request.nextUrl
          const { pathname, searchParams } = url
          const query = Object.fromEntries(searchParams)

          // Preflight request
          if (request.method === 'HEAD') {
            return new Response('OK.', {
              headers: { 'x-middleware-ssr': '1' }
            })
          }

          const renderServerComponentData = ${
            isServerComponent ? `query.__flight__ !== undefined` : 'false'
          }
          delete query.__flight__

          const req = { url: pathname }
          const renderOpts = {
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
            buildId: ${JSON.stringify(buildId)},
            assetPrefix: ${JSON.stringify(assetPrefix || '')},
            env: process.env,
            basePath: ${JSON.stringify(basePath || '')},
            supportsDynamicHTML: true,
            concurrentFeatures: true,
            renderServerComponentData,
            serverComponentManifest: ${
              isServerComponent ? 'rscManifest' : 'null'
            },
          }

          const transformStream = new TransformStream()
          const writer = transformStream.writable.getWriter()
          const encoder = new TextEncoder()
          let result
          let renderError
          let statusCode = 200
          try {
            result = await renderToHTML(
              req,
              {},
              pathname,
              query,
              renderOpts
            )
          } catch (err) {
            renderError = err
            statusCode = 500
          }
          if (renderError) {
            try {
              const errorRes = { statusCode, err: renderError }
              result = await renderToHTML(
                req,
                errorRes,
                pathname,
                query,
                { ...renderOpts, Component: ErrorPage }
              )
            } catch (err) {
              return new Response(
                (err || 'An error occurred while rendering ' + pathname + '.').toString(),
                {
                  status: 500,
                  headers: { 'x-middleware-ssr': '1' }
                }
              )
            }
          }

          result.pipe({
            write: str => writer.write(encoder.encode(str)),
            end: () => writer.close(),
            // Not implemented: cork/uncork/on/removeListener
          })

          return new Response(transformStream.readable, {
            headers: { 'x-middleware-ssr': '1' },
            status: statusCode
          })
        }

        export default function rscMiddleware(opts) {
          return adapter({
            ...opts,
            handler: render
          })
        }
    `

  return transformed
}
