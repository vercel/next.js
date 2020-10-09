import devalue from 'next/dist/compiled/devalue'
import escapeRegexp from 'next/dist/compiled/escape-string-regexp'
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
  poweredByHeader: string
  canonicalBase: string
  basePath: string
  runtimeConfig: string
  previewProps: string
  loadedEnvFiles: string
  i18n: string
}

const vercelHeader = 'x-vercel-id'

const nextServerlessLoader: loader.Loader = function () {
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
    poweredByHeader,
    basePath,
    runtimeConfig,
    previewProps,
    loadedEnvFiles,
    i18n,
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

  const i18nEnabled = !!i18n

  const defaultRouteRegex = pageIsDynamicRoute
    ? `
      const defaultRouteRegex = getRouteRegex("${page}")
    `
    : ''

  const normalizeDynamicRouteParams = pageIsDynamicRoute
    ? `
      function normalizeDynamicRouteParams(query) {
        return Object.keys(defaultRouteRegex.groups)
          .reduce((prev, key) => {
            let value = query[key]

            ${
              ''
              // non-provided optional values should be undefined so normalize
              // them to undefined
            }
            if(
              defaultRouteRegex.groups[key].optional &&
              (!value || (
                Array.isArray(value) &&
                value.length === 1 &&
                ${
                  ''
                  // fallback optional catch-all SSG pages have
                  // [[...paramName]] for the root path on Vercel
                }
                (value[0] === 'index' || value[0] === \`[[...\${key}]]\`)
              ))
            ) {
              value = undefined
              delete query[key]
            }
            ${
              ''
              // query values from the proxy aren't already split into arrays
              // so make sure to normalize catch-all values
            }
            if (
              value &&
              typeof value === 'string' &&
              defaultRouteRegex.groups[key].repeat
            ) {
              value = value.split('/')
            }

            if (value) {
              prev[key] = value
            }
            return prev
          }, {})
      }
    `
    : ''
  const envLoading = `
    const { processEnv } = require('@next/env')
    processEnv(${Buffer.from(loadedEnvFiles, 'base64').toString()})
  `

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
    const { pathToRegexp, default: pathMatch } = require('next/dist/next-server/lib/router/utils/path-match')
  `

  const handleRewrites = `
    const getCustomRouteMatcher = pathMatch(true)
    const prepareDestination = require('next/dist/next-server/lib/router/utils/prepare-destination').default

    function handleRewrites(parsedUrl) {
      for (const rewrite of rewrites) {
        const matcher = getCustomRouteMatcher(rewrite.source)
        const params = matcher(parsedUrl.pathname)

        if (params) {
          const { parsedDestination } = prepareDestination(
            rewrite.destination,
            params,
            parsedUrl.query,
            true,
            "${basePath}"
          )

          Object.assign(parsedUrl.query, parsedDestination.query)
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

  const handleBasePath = basePath
    ? `
    // always strip the basePath if configured since it is required
    req.url = req.url.replace(new RegExp('^${basePath}'), '') || '/'
    parsedUrl.pathname = parsedUrl.pathname.replace(new RegExp('^${basePath}'), '') || '/'
  `
    : ''

  const handleLocale = i18nEnabled
    ? `
      // get pathname from URL with basePath stripped for locale detection
      const i18n = ${i18n}
      const accept = require('@hapi/accept')
      const { detectLocaleCookie } = require('next/dist/next-server/lib/i18n/detect-locale-cookie')
      const { normalizeLocalePath } = require('next/dist/next-server/lib/i18n/normalize-locale-path')
      let detectedLocale = detectLocaleCookie(req, i18n.locales)

      if (!detectedLocale) {
        detectedLocale = accept.language(
          req.headers['accept-language'],
          i18n.locales
        )
      }

      const denormalizedPagePath = denormalizePagePath(parsedUrl.pathname || '/')
      const detectedDefaultLocale = detectedLocale === i18n.defaultLocale
      const shouldStripDefaultLocale =
        detectedDefaultLocale &&
        denormalizedPagePath === \`/\${i18n.defaultLocale}\`
      const shouldAddLocalePrefix =
        !detectedDefaultLocale && denormalizedPagePath === '/'
      detectedLocale = detectedLocale || i18n.defaultLocale

      if (
        !fromExport &&
        !nextStartMode &&
        i18n.localeDetection !== false &&
        (shouldAddLocalePrefix || shouldStripDefaultLocale)
      ) {
        res.setHeader(
          'Location',
          formatUrl({
            // make sure to include any query values when redirecting
            ...parsedUrl,
            pathname: shouldStripDefaultLocale ? '/' : \`/\${detectedLocale}\`,
          })
        )
        res.statusCode = 307
        res.end()
        return
      }

      // TODO: domain based locales (domain to locale mapping needs to be provided in next.config.js)
      const localePathResult = normalizeLocalePath(parsedUrl.pathname, i18n.locales)

      if (localePathResult.detectedLocale) {
        detectedLocale = localePathResult.detectedLocale
        req.url = formatUrl({
          ...parsedUrl,
          pathname: localePathResult.pathname,
        })
        parsedUrl.pathname = localePathResult.pathname
      }

      detectedLocale = detectedLocale || i18n.defaultLocale
    `
    : `
      const i18n = {}
      const detectedLocale = undefined
    `

  if (page.match(API_ROUTE)) {
    return `
      import initServer from 'next-plugin-loader?middleware=on-init-server!'
      import onError from 'next-plugin-loader?middleware=on-error-server!'
      import 'next/dist/next-server/server/node-polyfill-fetch'

      ${envLoading}
      ${runtimeConfigImports}
      ${
        /*
          this needs to be called first so its available for any other imports
        */
        runtimeConfigSetter
      }
      ${dynamicRouteImports}
      const { parse: parseUrl } = require('url')
      const { apiResolver } = require('next/dist/next-server/server/api-utils')
      ${rewriteImports}

      ${dynamicRouteMatcher}

      ${defaultRouteRegex}

      ${normalizeDynamicRouteParams}

      ${handleRewrites}

      export default async (req, res) => {
        try {
          await initServer()

          // We need to trust the dynamic route params from the proxy
          // to ensure we are using the correct values
          const trustQuery = req.headers['${vercelHeader}']
          const parsedUrl = handleRewrites(parseUrl(req.url, true))

          ${handleBasePath}

          const params = ${
            pageIsDynamicRoute
              ? `
              normalizeDynamicRouteParams(
                trustQuery
                  ? parsedUrl.query
                  : dynamicRouteMatcher(parsedUrl.pathname)
              )
              `
              : `{}`
          }

          const resolver = require('${absolutePagePath}')
          await apiResolver(
            req,
            res,
            Object.assign({}, parsedUrl.query, params ),
            resolver,
            ${encodedPreviewProps},
            true,
            onError
          )
        } catch (err) {
          console.error(err)
          await onError(err)

          // TODO: better error for DECODE_FAILED?
          if (err.code === 'DECODE_FAILED') {
            res.statusCode = 400
            res.end('Bad Request')
          } else {
            // Throw the error to crash the serverless function
            throw err
          }
        }
      }
    `
  } else {
    return `
    import initServer from 'next-plugin-loader?middleware=on-init-server!'
    import onError from 'next-plugin-loader?middleware=on-error-server!'
    import 'next/dist/next-server/server/node-polyfill-fetch'
    const {isResSent} = require('next/dist/next-server/lib/utils');

    ${envLoading}
    ${runtimeConfigImports}
    ${
      // this needs to be called first so its available for any other imports
      runtimeConfigSetter
    }
    const {parse: parseUrl, format: formatUrl} = require('url')
    const {parse: parseQs} = require('querystring')
    const { renderToHTML } = require('next/dist/next-server/server/render');
    const { tryGetPreviewData } = require('next/dist/next-server/server/api-utils');
    const { denormalizePagePath } = require('next/dist/next-server/server/denormalize-page-path')
    const { setLazyProp, getCookieParser } = require('next/dist/next-server/server/api-utils')
    const {sendPayload} = require('next/dist/next-server/server/send-payload');
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
    ${defaultRouteRegex}
    ${normalizeDynamicRouteParams}
    ${handleRewrites}

    export const config = ComponentInfo['confi' + 'g'] || {}
    export const _app = App
    export async function renderReqToHTML(req, res, renderMode, _renderOpts, _params) {
      const fromExport = renderMode === 'export' || renderMode === true;
      const nextStartMode = renderMode === 'passthrough'

      setLazyProp({ req }, 'cookies', getCookieParser(req))

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
        env: process.env,
        basePath: "${basePath}",
        ..._renderOpts
      }
      let _nextData = false
      let parsedUrl

      try {
        // We need to trust the dynamic route params from the proxy
        // to ensure we are using the correct values
        const trustQuery = !getStaticProps && req.headers['${vercelHeader}']
        let parsedUrl = parseUrl(req.url, true)
        let routeNoAssetPath = parsedUrl.pathname${
          basePath ? `.replace(new RegExp('^${basePath}'), '') || '/'` : ''
        }
        const origQuery = Object.assign({}, parsedUrl.query)

        parsedUrl = handleRewrites(parsedUrl)

        ${handleBasePath}

        if (parsedUrl.pathname.match(/_next\\/data/)) {
          const {
            default: getrouteNoAssetPath,
          } = require('next/dist/next-server/lib/router/utils/get-route-from-asset-path');
          _nextData = true;
          parsedUrl.pathname = getrouteNoAssetPath(
            parsedUrl.pathname.replace(
              new RegExp('/_next/data/${escapedBuildId}/'),
              '/'
            ),
            '.json'
          );
          routeNoAssetPath = parsedUrl.pathname
        }

        ${handleLocale}

        const renderOpts = Object.assign(
          {
            Component,
            pageConfig: config,
            nextExport: fromExport,
            isDataReq: _nextData,
            locale: detectedLocale,
            locales: i18n.locales,
            defaultLocale: i18n.defaultLocale,
          },
          options,
        )

        ${
          page === '/_error'
            ? `
          if (!res.statusCode) {
            res.statusCode = 404
          }
        `
            : ''
        }

        ${
          pageIsDynamicRoute
            ? `
            const params = (
              fromExport
            ) ? {}
              : normalizeDynamicRouteParams(
                trustQuery
                  ? parsedUrl.query
                  : dynamicRouteMatcher(parsedUrl.pathname)
              )
            `
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

        // make sure to normalize req.url on Vercel to strip dynamic params
        // from the query which are added during routing
        ${
          pageIsDynamicRoute
            ? `
          if (trustQuery) {
            const _parsedUrl = parseUrl(req.url, true)
            delete _parsedUrl.search

            for (const param of Object.keys(defaultRouteRegex.groups)) {
              delete _parsedUrl.query[param]
            }
            req.url = formatUrl(_parsedUrl)
          }
        `
            : ''
        }

        // normalize request URL/asPath for fallback/revalidate pages since the
        // proxy sets the request URL to the output's path for fallback pages
        ${
          pageIsDynamicRoute
            ? `
            if (nowParams) {
              const _parsedUrl = parseUrl(req.url)

              for (const param of Object.keys(defaultRouteRegex.groups)) {
                const paramIdx = _parsedUrl.pathname.indexOf(\`[\${param}]\`)

                if (paramIdx > -1) {
                  _parsedUrl.pathname = _parsedUrl.pathname.substr(0, paramIdx) +
                    encodeURI(nowParams[param]) +
                    _parsedUrl.pathname.substr(paramIdx + param.length + 2)
                }
              }
              parsedUrl.pathname = _parsedUrl.pathname
              req.url = formatUrl(_parsedUrl)
            }
          `
            : ``
        }

        // make sure to normalize asPath for revalidate and _next/data requests
        // since the asPath should match what is shown on the client
        if (
          !fromExport &&
          (getStaticProps || getServerSideProps)
        ) {
          ${
            pageIsDynamicRoute
              ? `
              // don't include dynamic route params in query while normalizing
              // asPath
              if (trustQuery) {
                delete parsedUrl.search

                for (const param of Object.keys(defaultRouteRegex.groups)) {
                  delete origQuery[param]
                }
              }
            `
              : ``
          }

          parsedUrl.pathname = denormalizePagePath(parsedUrl.pathname)
          renderOpts.resolvedUrl = formatUrl({
            ...parsedUrl,
            query: origQuery
          })

          // For getServerSideProps we need to ensure we use the original URL
          // and not the resolved URL to prevent a hydration mismatch on asPath
          renderOpts.resolvedAsPath = getServerSideProps
            ? formatUrl({
              ...parsedUrl,
              pathname: routeNoAssetPath,
              query: origQuery,
            })
            : renderOpts.resolvedUrl
        }

        const isFallback = parsedUrl.query.__nextFallback

        const previewData = tryGetPreviewData(req, res, options.previewProps)
        const isPreviewMode = previewData !== false

        if (process.env.__NEXT_OPTIMIZE_FONTS) {
          renderOpts.optimizeFonts = true
          /**
           * __webpack_require__.__NEXT_FONT_MANIFEST__ is added by
           * font-stylesheet-gathering-plugin
           */
          renderOpts.fontManifest = __webpack_require__.__NEXT_FONT_MANIFEST__;
          process.env['__NEXT_OPTIMIZE_FONT'+'S'] = true
        }
        let result = await renderToHTML(req, res, "${page}", Object.assign({}, getStaticProps ? { ...(parsedUrl.query.amp ? { amp: '1' } : {}) } : parsedUrl.query, nowParams ? nowParams : params, _params, isFallback ? { __nextFallback: 'true' } : {}), renderOpts)

        if (!renderMode) {
          if (_nextData || getStaticProps || getServerSideProps) {
            sendPayload(req, res, _nextData ? JSON.stringify(renderOpts.pageData) : result, _nextData ? 'json' : 'html', ${
              generateEtags === 'true' ? true : false
            }, {
              private: isPreviewMode,
              stateful: !!getServerSideProps,
              revalidate: renderOpts.revalidate,
            })
            return null
          }
        } else if (isPreviewMode) {
          res.setHeader(
            'Cache-Control',
            'private, no-cache, no-store, max-age=0, must-revalidate'
          )
        }

        if (renderMode) return { html: result, renderOpts }
        return result
      } catch (err) {
        if (!parsedUrl) {
          parsedUrl = parseUrl(req.url, true)
        }

        if (err.code === 'ENOENT') {
          res.statusCode = 404
        } else if (err.code === 'DECODE_FAILED') {
          // TODO: better error?
          res.statusCode = 400
        } else {
          console.error('Unhandled error during request:', err)

          // Backwards compat (call getInitialProps in custom error):
          try {
            await renderToHTML(req, res, "/_error", parsedUrl.query, Object.assign({}, options, {
              getStaticProps: undefined,
              getStaticPaths: undefined,
              getServerSideProps: undefined,
              Component: Error,
              err: err,
              // Short-circuit rendering:
              isDataReq: true
            }))
          } catch (underErrorErr) {
            console.error('Failed call /_error subroutine, continuing to crash function:', underErrorErr)
          }

          // Throw the error to crash the serverless function
          if (isResSent(res)) {
            console.error('!!! WARNING !!!')
            console.error(
              'Your function crashed, but closed the response before allowing the function to exit.\\n' +
              'This may cause unexpected behavior for the next request.'
            )
            console.error('!!! WARNING !!!')
          }
          throw err
        }

        const result = await renderToHTML(req, res, "/_error", parsedUrl.query, Object.assign({}, options, {
          getStaticProps: undefined,
          getStaticPaths: undefined,
          getServerSideProps: undefined,
          Component: Error,
          err: res.statusCode === 404 ? undefined : err
        }))
        return result
      }
    }
    export async function render (req, res) {
      try {
        await initServer()
        const html = await renderReqToHTML(req, res)
        if (html) {
          sendPayload(req, res, html, 'html', {generateEtags: ${JSON.stringify(
            generateEtags === 'true'
          )}, poweredByHeader: ${JSON.stringify(poweredByHeader === 'true')}})
        }
      } catch(err) {
        console.error(err)
        await onError(err)
        // Throw the error to crash the serverless function
        throw err
      }
    }
  `
  }
}

export default nextServerlessLoader
