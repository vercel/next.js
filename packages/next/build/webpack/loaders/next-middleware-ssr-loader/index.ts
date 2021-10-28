import loaderUtils from 'next/dist/compiled/loader-utils'
import { getStringifiedAbsolutePath } from './utils'

export default function middlewareRSCLoader(this: any) {
  const {
    absolutePagePath,
    basePath,
    isServerComponent,
    assetPrefix,
    buildId,
  } = loaderUtils.getOptions(this)
  const stringifiedAbsolutePagePath = loaderUtils.stringifyRequest(
    this,
    absolutePagePath
  )
  const stringifiedAbsoluteDocumentPath = getStringifiedAbsolutePath(
    this,
    './pages/_document'
  )
  const stringifiedAbsoluteAppPath = getStringifiedAbsolutePath(
    this,
    './pages/_app'
  )

  const transformed = `
        import { adapter } from 'next/dist/server/web/adapter'

        import { RouterContext } from 'next/dist/shared/lib/router-context'
        import { renderToHTML } from 'next/dist/server/web/render'

        import React, { createElement } from 'react'
        import ReactDOMServer from 'react-dom/server.browser'

        ${
          isServerComponent
            ? `
        import { renderToReadableStream } from 'next/dist/compiled/react-server-dom-webpack/writer.browser.server'
        import { createFromReadableStream } from 'next/dist/compiled/react-server-dom-webpack'`
            : ''
        }

        var {
          default: Page,
          config,
          getStaticProps,
          getServerSideProps,
          getStaticPaths
        } = require(${stringifiedAbsolutePagePath})
        var Document = require(${stringifiedAbsoluteDocumentPath}).default
        var App = require(${stringifiedAbsoluteAppPath}).default

        const buildManifest = self.__BUILD_MANIFEST
        const reactLoadableManifest = self.__REACT_LOADABLE_MANIFEST
        const rscManifest = self._middleware_rsc_manifest

        if (typeof Page !== 'function') {
          throw new Error('Your page must export a \`default\` component');
        }

        function wrapReadable (readable) {
          var encoder = new TextEncoder()
          var transformStream = new TransformStream()
          var writer = transformStream.writable.getWriter()
          var reader = readable.getReader()
          var process = () => {
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
          var response = responseCache
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
            : `
        const Component = Page`
        }

        function render(request) {
          const url = request.nextUrl
          const query = Object.fromEntries(url.searchParams)

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
                    route: url.pathname,
                    asPath: url.pathname,
                    pathname: url.pathname,
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

          renderToHTML(
            { url: url.pathname },
            {},
            url.pathname,
            query,
            renderOpts
          ).then(result => {
            result.pipe({
              write: str => writer.write(encoder.encode(str)),
              end: () => writer.close()
            })
          })

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
