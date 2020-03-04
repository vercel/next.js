import devalue from 'devalue'
import escapeRegexp from 'escape-string-regexp'
import { join } from 'path'
import { parse } from 'querystring'
import { loader } from 'webpack'
import { API_ROUTE } from '../../../lib/constants'
import {
  BUILD_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  ROUTES_MANIFEST,
} from '../../../next-server/lib/constants'
import { isDynamicRoute } from '../../../next-server/lib/router/utils'
import { __ApiPreviewProps } from '../../../next-server/server/api-utils'

export type ServerlessLoaderQuery = {
  page: string
  distDir: string
  absolutePagePath: string
  absoluteAppPath: string
  absoluteDocumentPath: string
  absoluteErrorPath: string
  buildId: string
  assetPrefix: string
  generateEtags: string
  canonicalBase: string
  basePath: string
  runtimeConfig: string
  previewProps: string
}

const nextServerlessLoader: loader.Loader = function() {
  const {
    distDir,
    absolutePagePath,
    page,
    buildId,
    canonicalBase,
    assetPrefix,
    absoluteAppPath,
    absoluteDocumentPath,
    absoluteErrorPath,
    generateEtags,
    basePath,
    runtimeConfig,
    previewProps,
  }: ServerlessLoaderQuery =
    typeof this.query === 'string' ? parse(this.query.substr(1)) : this.query

  const buildManifest = join(distDir, BUILD_MANIFEST).replace(/\\/g, '/')
  const reactLoadableManifest = join(distDir, REACT_LOADABLE_MANIFEST).replace(
    /\\/g,
    '/'
  )
  const routesManifest = join(distDir, ROUTES_MANIFEST).replace(/\\/g, '/')

  const escapedBuildId = escapeRegexp(buildId)
  const pageIsDynamicRoute = isDynamicRoute(page)

  const encodedPreviewProps = devalue(
    JSON.parse(previewProps) as __ApiPreviewProps
  )

  const runtimeConfigImports = runtimeConfig
    ? `
      const { setConfig } = require('next/config')
    `
    : ''

  const runtimeConfigSetter = runtimeConfig
    ? `
      const runtimeConfig = ${runtimeConfig}
      setConfig(runtimeConfig)
    `
    : 'const runtimeConfig = {}'

  const dynamicRouteImports = pageIsDynamicRoute
    ? `
    const { getRouteMatcher } = require('next/dist/next-server/lib/router/utils/route-matcher');
      const { getRouteRegex } = require('next/dist/next-server/lib/router/utils/route-regex');
  `
    : ''

  const dynamicRouteMatcher = pageIsDynamicRoute
    ? `
    const dynamicRouteMatcher = getRouteMatcher(getRouteRegex("${page}"))
  `
    : ''

  const rewriteImports = `
    const { rewrites } = require('${routesManifest}')
    const { pathToRegexp, default: pathMatch } = require('next/dist/next-server/server/lib/path-match')
  `

  const handleRewrites = `
    const getCustomRouteMatcher = pathMatch(true)
    const {prepareDestination} = require('next/dist/next-server/server/router')

    function handleRewrites(parsedUrl) {
      for (const rewrite of rewrites) {
        const matcher = getCustomRouteMatcher(rewrite.source)
        const params = matcher(parsedUrl.pathname)

        if (params) {
          const { parsedDestination } = prepareDestination(
            rewrite.destination,
            params
          )
          Object.assign(parsedUrl.query, parsedDestination.query, params)
          delete parsedDestination.query

          Object.assign(parsedUrl, parsedDestination)

          if (parsedUrl.pathname === '${page}'){
            break
          }
          ${
            pageIsDynamicRoute
              ? `
            const dynamicParams = dynamicRouteMatcher(parsedUrl.pathname);\
            if (dynamicParams) {
              parsedUrl.query = {
                ...parsedUrl.query,
                ...dynamicParams
              }
              break
            }
          `
              : ''
          }
        }
      }

      return parsedUrl
    }
  `

  if (page.match(API_ROUTE)) {
    return `
      import initServer from 'next-plugin-loader?middleware=on-init-server!'
      import onError from 'next-plugin-loader?middleware=on-error-server!'
      ${runtimeConfigImports}
      ${
        /*
          this needs to be called first so its available for any other imports
        */
        runtimeConfigSetter
      }
      ${dynamicRouteImports}
      const { parse } = require('url')
      const { apiResolver } = require('next/dist/next-server/server/api-utils')
      ${rewriteImports}

      ${dynamicRouteMatcher}
      ${handleRewrites}

      export default async (req, res) => {
        try {
          await initServer()

          ${
            basePath
              ? `
          if(req.url.startsWith('${basePath}')) {
            req.url = req.url.replace('${basePath}', '')
          }
          `
              : ''
          }
          const parsedUrl = handleRewrites(parse(req.url, true))

          const params = ${
            pageIsDynamicRoute
              ? `dynamicRouteMatcher(parsedUrl.pathname)`
              : `{}`
          }

          const resolver = require('${absolutePagePath}')
          apiResolver(
            req,
            res,
            Object.assign({}, parsedUrl.query, params ),
            resolver,
            ${encodedPreviewProps},
            onError
          )
        } catch (err) {
          console.error(err)
          await onError(err)
          res.statusCode = 500
          res.end('Internal Server Error')
        }
      }
    `
  } else {
    return `
    import initServer from 'next-plugin-loader?middleware=on-init-server!'
    import onError from 'next-plugin-loader?middleware=on-error-server!'
    ${runtimeConfigImports}
    ${
      // this needs to be called first so its available for any other imports
      runtimeConfigSetter
    }
    const {parse} = require('url')
    const {parse: parseQs} = require('querystring')
    const {renderToHTML} = require('next/dist/next-server/server/render');
    const { tryGetPreviewData } = require('next/dist/next-server/server/api-utils');
    const {sendHTML} = require('next/dist/next-server/server/send-html');
    const buildManifest = require('${buildManifest}');
    const reactLoadableManifest = require('${reactLoadableManifest}');
    const Document = require('${absoluteDocumentPath}').default;
    const Error = require('${absoluteErrorPath}').default;
    const App = require('${absoluteAppPath}').default;
    ${dynamicRouteImports}
    ${rewriteImports}

    const ComponentInfo = require('${absolutePagePath}')

    const Component = ComponentInfo.default
    export default Component
    export const unstable_getStaticParams = ComponentInfo['unstable_getStaticParam' + 's']
    export const getStaticProps = ComponentInfo['getStaticProp' + 's']
    export const getStaticPaths = ComponentInfo['getStaticPath' + 's']
    export const getServerSideProps = ComponentInfo['getServerSideProp' + 's']

    // kept for detecting legacy exports
    export const unstable_getStaticProps = ComponentInfo['unstable_getStaticProp' + 's']
    export const unstable_getStaticPaths = ComponentInfo['unstable_getStaticPath' + 's']
    export const unstable_getServerProps = ComponentInfo['unstable_getServerProp' + 's']

    ${dynamicRouteMatcher}
    ${handleRewrites}

    export const config = ComponentInfo['confi' + 'g'] || {}
    export const _app = App
    export async function renderReqToHTML(req, res, fromExport, _renderOpts, _params) {
      ${
        basePath
          ? `
      if(req.url.startsWith('${basePath}')) {
        req.url = req.url.replace('${basePath}', '')
      }
      `
          : ''
      }
      const options = {
        App,
        Document,
        buildManifest,
        getStaticProps,
        getServerSideProps,
        getStaticPaths,
        reactLoadableManifest,
        canonicalBase: "${canonicalBase}",
        buildId: "${buildId}",
        assetPrefix: "${assetPrefix}",
        runtimeConfig: runtimeConfig.publicRuntimeConfig || {},
        previewProps: ${encodedPreviewProps},
        ..._renderOpts
      }
      let _nextData = false

      const parsedUrl = handleRewrites(parse(req.url, true))

      if (parsedUrl.pathname.match(/_next\\/data/)) {
        _nextData = true
        parsedUrl.pathname = parsedUrl.pathname
          .replace(new RegExp('/_next/data/${escapedBuildId}/'), '/')
          .replace(/\\.json$/, '')
      }

      const renderOpts = Object.assign(
        {
          Component,
          pageConfig: config,
          nextExport: fromExport
        },
        options,
      )
      try {
        ${page === '/_error' ? `res.statusCode = 404` : ''}
        ${
          pageIsDynamicRoute
            ? `const params = fromExport && !getStaticProps && !getServerSideProps ? {} : dynamicRouteMatcher(parsedUrl.pathname) || {};`
            : `const params = {};`
        }
        ${
          // Temporary work around: `x-now-route-matches` is a platform header
          // _only_ set for `Prerender` requests. We should move this logic
          // into our builder to ensure we're decoupled. However, this entails
          // removing reliance on `req.url` and using `req.query` instead
          // (which is needed for "custom routes" anyway).
          pageIsDynamicRoute
            ? `const nowParams = req.headers && req.headers["x-now-route-matches"]
              ? getRouteMatcher(
                  (function() {
                    const { re, groups } = getRouteRegex("${page}");
                    return {
                      re: {
                        // Simulate a RegExp match from the \`req.url\` input
                        exec: str => {
                          const obj = parseQs(str);
                          return Object.keys(obj).reduce(
                            (prev, key) =>
                              Object.assign(prev, {
                                [key]: obj[key]
                              }),
                            {}
                          );
                        }
                      },
                      groups
                    };
                  })()
                )(req.headers["x-now-route-matches"])
              : null;
          `
            : `const nowParams = null;`
        }
        // make sure to set renderOpts to the correct params e.g. _params
        // if provided from worker or params if we're parsing them here
        renderOpts.params = _params || params

        const isFallback = parsedUrl.query.__nextFallback

        const previewData = tryGetPreviewData(req, res, options.previewProps)
        const isPreviewMode = previewData !== false

        let result = await renderToHTML(req, res, "${page}", Object.assign({}, getStaticProps ? {} : parsedUrl.query, nowParams ? nowParams : params, _params, isFallback ? { __nextFallback: 'true' } : {}), renderOpts)

        if (_nextData && !fromExport) {
          const payload = JSON.stringify(renderOpts.pageData)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-Length', Buffer.byteLength(payload))

          res.setHeader(
            'Cache-Control',
            isPreviewMode
              ? \`private, no-cache, no-store, max-age=0, must-revalidate\`
              : getServerSideProps
              ? \`no-cache, no-store, must-revalidate\`
              : \`s-maxage=\${renderOpts.revalidate}, stale-while-revalidate\`
          )
          res.end(payload)
          return null
        } else if (isPreviewMode) {
          res.setHeader(
            'Cache-Control',
            'private, no-cache, no-store, max-age=0, must-revalidate'
          )
        }

        if (fromExport) return { html: result, renderOpts }
        return result
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.statusCode = 404
          const result = await renderToHTML(req, res, "/_error", parsedUrl.query, Object.assign({}, options, {
            getStaticProps: undefined,
            getStaticPaths: undefined,
            getServerSideProps: undefined,
            Component: Error
          }))
          return result
        } else {
          console.error(err)
          res.statusCode = 500
          const result = await renderToHTML(req, res, "/_error", parsedUrl.query, Object.assign({}, options, {
            getStaticProps: undefined,
            getStaticPaths: undefined,
            getServerSideProps: undefined,
            Component: Error,
            err
          }))
          return result
        }
      }
    }
    export async function render (req, res) {
      try {
        await initServer()
        const html = await renderReqToHTML(req, res)
        if (html) {
          sendHTML(req, res, html, {generateEtags: ${generateEtags}})
        }
      } catch(err) {
        await onError(err)
        console.error(err)
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    }
  `
  }
}

export default nextServerlessLoader
