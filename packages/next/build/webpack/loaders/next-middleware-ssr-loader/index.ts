import { stringifyRequest } from '../../stringify-request'

export default async function middlewareRSCLoader(this: any) {
  const {
    absolutePagePath,
    absoluteAppPath,
    absoluteDocumentPath,
    basePath,
    isServerComponent: isServerComponentQuery,
    assetPrefix,
    buildId,
  } = this.getOptions()

  const isServerComponent = isServerComponentQuery === 'true'
  const stringifiedAbsolutePagePath = stringifyRequest(this, absolutePagePath)
  const stringifiedAbsoluteAppPath = stringifyRequest(this, absoluteAppPath)
  const stringifiedAbsoluteDocumentPath = stringifyRequest(
    this,
    absoluteDocumentPath
  )

  let appDefinition = `const App = require(${stringifiedAbsoluteAppPath}).default`
  let documentDefinition = `const Document = require(${stringifiedAbsoluteDocumentPath}).default`

  const transformed = `
        import { adapter } from 'next/dist/server/web/adapter'

        import { RouterContext } from 'next/dist/shared/lib/router-context'
        import { renderToHTML } from 'next/dist/server/web/render'

        import React, { createElement } from 'react'

        ${
          isServerComponent
            ? `
        import { renderToReadableStream } from 'next/dist/compiled/react-server-dom-webpack/writer.browser.server'
        import { createFromReadableStream } from 'next/dist/compiled/react-server-dom-webpack'`
            : ''
        }

        ${appDefinition}
        ${documentDefinition}
        
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

        function wrapReadable(readable) {
          const encoder = new TextEncoder()
          const transformStream = new TransformStream()
          const writer = transformStream.writable.getWriter()
          const reader = readable.getReader()
          const process = () => {
            reader.read().then(({ done, value }) => {
              if (!done) {
                writer.write(typeof value === 'string' ? encoder.encode(value) : value)
                process()
              } else {
                writer.close()
              }
            })
          }
          process()
          return transformStream.readable
        }
        
        ${
          isServerComponent
            ? `
        const renderFlight = props => renderToReadableStream(createElement(Page, props), rscManifest)

        let responseCache
        const FlightWrapper = props => {
          let response = responseCache
          if (!response) {
            responseCache = response = createFromReadableStream(renderFlight(props))
          }
          return response.readRoot()
        }
        const Component = props => {
          return createElement(
            React.Suspense,
            { fallback: null },
            createElement(FlightWrapper, props)
          )
        }`
            : `const Component = Page`
        }

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

          ${
            isServerComponent
              ? `
          // Flight data request
          const isFlightDataRequest = query.__flight__ !== undefined
          if (isFlightDataRequest) {
            delete query.__flight__
            return new Response(
              wrapReadable(
                renderFlight({
                  router: {
                    route: pathname,
                    asPath: pathname,
                    pathname: pathname,
                    query,
                  }
                })
              )
            )
          }`
              : ''
          }

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
            renderServerComponent: ${isServerComponent ? 'true' : 'false'},
          }

          const transformStream = new TransformStream()
          const writer = transformStream.writable.getWriter()
          const encoder = new TextEncoder()

          try {
            const result = await renderToHTML(
              { url: pathname },
              {},
              pathname,
              query,
              renderOpts
            )
            result.pipe({
              write: str => writer.write(encoder.encode(str)),
              end: () => writer.close()
            })
          } catch (err) {
            return new Response(
              (err || 'An error occurred while rendering ' + pathname + '.').toString(),
              {
                status: 500,
                headers: { 'x-middleware-ssr': '1' }
              }
            )
          }

          return new Response(transformStream.readable, {
            headers: { 'x-middleware-ssr': '1' }
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
