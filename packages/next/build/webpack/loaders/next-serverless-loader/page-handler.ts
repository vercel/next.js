import { parse as parseQs } from 'querystring'
import { IncomingMessage, ServerResponse } from 'http'
import { parse as parseUrl, format as formatUrl, UrlWithParsedQuery } from 'url'
import { isResSent } from '../../../../next-server/lib/utils'
import { sendPayload } from '../../../../next-server/server/send-payload'
import { getUtils, vercelHeader, ServerlessHandlerCtx } from './utils'

import { renderToHTML } from '../../../../next-server/server/render'
import { tryGetPreviewData } from '../../../../next-server/server/api-utils'
import { denormalizePagePath } from '../../../../next-server/server/denormalize-page-path'
import {
  setLazyProp,
  getCookieParser,
} from '../../../../next-server/server/api-utils'
import { getRedirectStatus } from '../../../../lib/load-custom-routes'
import getRouteNoAssetPath from '../../../../next-server/lib/router/utils/get-route-from-asset-path'
import { getRouteMatcher } from '../../../../next-server/lib/router/utils/route-matcher'
import { PERMANENT_REDIRECT_STATUS } from '../../../../next-server/lib/constants'

export function getPageHandler(ctx: ServerlessHandlerCtx) {
  const {
    page,

    pageComponent,
    pageConfig,
    pageGetStaticProps,
    pageGetStaticPaths,
    pageGetServerSideProps,

    appModule,
    documentModule,
    errorModule,
    notFoundModule,

    encodedPreviewProps,
    pageIsDynamic,
    generateEtags,
    poweredByHeader,

    runtimeConfig,
    buildManifest,
    reactLoadableManifest,

    i18n,
    buildId,
    basePath,
    assetPrefix,
    canonicalBase,
    escapedBuildId,

    experimental: { initServer, onError },
  } = ctx
  const {
    handleLocale,
    handleRewrites,
    handleBasePath,
    defaultRouteRegex,
    dynamicRouteMatcher,
    normalizeDynamicRouteParams,
  } = getUtils(ctx)

  async function renderReqToHTML(
    req: IncomingMessage,
    res: ServerResponse,
    renderMode?: 'export' | 'passthrough' | true,
    _renderOpts?: any,
    _params?: any
  ) {
    let Component
    let App
    let config
    let Document
    let Error
    let notFoundMod
    let getStaticProps
    let getStaticPaths
    let getServerSideProps
    ;[
      getStaticProps,
      getServerSideProps,
      getStaticPaths,
      Component,
      App,
      config,
      { default: Document },
      { default: Error },
      notFoundMod,
    ] = await Promise.all([
      pageGetStaticProps,
      pageGetServerSideProps,
      pageGetStaticPaths,
      pageComponent,
      appModule,
      pageConfig,
      documentModule,
      errorModule,
      notFoundModule,
    ])

    const fromExport = renderMode === 'export' || renderMode === true
    const nextStartMode = renderMode === 'passthrough'

    let hasValidParams = true

    setLazyProp({ req: req as any }, 'cookies', getCookieParser(req))

    const options = {
      App,
      Document,
      buildManifest,
      getStaticProps,
      getServerSideProps,
      getStaticPaths,
      reactLoadableManifest,
      canonicalBase,
      buildId,
      assetPrefix,
      runtimeConfig: (runtimeConfig || {}).publicRuntimeConfig || {},
      previewProps: encodedPreviewProps,
      env: process.env,
      basePath,
      ..._renderOpts,
    }
    let _nextData = false
    let defaultLocale = i18n?.defaultLocale
    let detectedLocale = i18n?.defaultLocale
    let parsedUrl: UrlWithParsedQuery

    try {
      // We need to trust the dynamic route params from the proxy
      // to ensure we are using the correct values
      const trustQuery = !getStaticProps && req.headers[vercelHeader]
      parsedUrl = parseUrl(req.url!, true)
      let routeNoAssetPath = parsedUrl.pathname!

      if (basePath) {
        routeNoAssetPath =
          routeNoAssetPath.replace(new RegExp(`^${basePath}`), '') || '/'
      }
      const origQuery = Object.assign({}, parsedUrl.query)

      parsedUrl = handleRewrites(parsedUrl)
      handleBasePath(req, parsedUrl)

      // remove ?amp=1 from request URL if rendering for export
      if (fromExport && parsedUrl.query.amp) {
        const queryNoAmp = Object.assign({}, origQuery)
        delete queryNoAmp.amp

        req.url = formatUrl({
          ...parsedUrl,
          search: undefined,
          query: queryNoAmp,
        })
      }

      if (parsedUrl.pathname!.match(/_next\/data/)) {
        _nextData = page !== '/_error'
        parsedUrl.pathname = getRouteNoAssetPath(
          parsedUrl.pathname!.replace(
            new RegExp(`/_next/data/${escapedBuildId}/`),
            '/'
          ),
          '.json'
        )
        routeNoAssetPath = parsedUrl.pathname
      }

      const localeResult = handleLocale(
        req,
        res,
        parsedUrl,
        routeNoAssetPath,
        fromExport || nextStartMode
      )
      defaultLocale = localeResult?.defaultLocale || defaultLocale
      detectedLocale = localeResult?.detectedLocale || detectedLocale
      routeNoAssetPath = localeResult?.routeNoAssetPath || routeNoAssetPath

      if (parsedUrl.query.nextInternalLocale) {
        detectedLocale = parsedUrl.query.nextInternalLocale as string
        delete parsedUrl.query.nextInternalLocale
      }

      const renderOpts = Object.assign(
        {
          Component,
          pageConfig: config,
          nextExport: fromExport,
          isDataReq: _nextData,
          locales: i18n?.locales,
          locale: detectedLocale,
          defaultLocale,
        },
        options
      )

      if (page === '/_error' && !res.statusCode) {
        res.statusCode = 404
      }

      let params = {}

      if (!fromExport && pageIsDynamic) {
        const result = normalizeDynamicRouteParams(
          trustQuery
            ? parsedUrl.query
            : (dynamicRouteMatcher!(parsedUrl.pathname) as Record<
                string,
                string | string[]
              >)
        )

        hasValidParams = result.hasValidParams
        params = result.params
      }

      let nowParams = null

      if (
        pageIsDynamic &&
        !hasValidParams &&
        req.headers?.['x-now-route-matches']
      ) {
        nowParams = getRouteMatcher(
          (function () {
            const { groups, routeKeys } = defaultRouteRegex!

            return {
              re: {
                // Simulate a RegExp match from the \`req.url\` input
                exec: (str: string) => {
                  const obj = parseQs(str)

                  // favor named matches if available
                  const routeKeyNames = Object.keys(routeKeys || {})

                  const filterLocaleItem = (val: string | string[]) => {
                    if (i18n) {
                      // locale items can be included in route-matches
                      // for fallback SSG pages so ensure they are
                      // filtered
                      const isCatchAll = Array.isArray(val)
                      const _val = isCatchAll ? val[0] : val

                      if (
                        typeof _val === 'string' &&
                        i18n.locales.some((item) => {
                          if (item.toLowerCase() === _val.toLowerCase()) {
                            detectedLocale = item
                            renderOpts.locale = detectedLocale
                            return true
                          }
                          return false
                        })
                      ) {
                        // remove the locale item from the match
                        if (isCatchAll) {
                          ;(val as string[]).splice(0, 1)
                        }

                        // the value is only a locale item and
                        // shouldn't be added
                        return isCatchAll ? val.length === 0 : true
                      }
                    }
                    return false
                  }

                  if (routeKeyNames.every((name) => obj[name])) {
                    return routeKeyNames.reduce((prev, keyName) => {
                      const paramName = routeKeys?.[keyName]

                      if (paramName && !filterLocaleItem(obj[keyName])) {
                        prev[groups[paramName].pos] = obj[keyName]
                      }
                      return prev
                    }, {} as any)
                  }

                  return Object.keys(obj).reduce((prev, key) => {
                    if (!filterLocaleItem(obj[key])) {
                      return Object.assign(prev, {
                        [key]: obj[key],
                      })
                    }
                    return prev
                  }, {})
                },
              },
              groups,
            }
          })() as any
        )(req.headers['x-now-route-matches'] as string)
      }

      // make sure to set renderOpts to the correct params e.g. _params
      // if provided from worker or params if we're parsing them here
      renderOpts.params = _params || params

      // make sure to normalize req.url on Vercel to strip dynamic params
      // from the query which are added during routing
      if (pageIsDynamic && trustQuery && defaultRouteRegex) {
        const _parsedUrl = parseUrl(req.url!, true)
        delete (_parsedUrl as any).search

        for (const param of Object.keys(defaultRouteRegex.groups)) {
          delete _parsedUrl.query[param]
        }
        req.url = formatUrl(_parsedUrl)
      }

      // normalize request URL/asPath for fallback/revalidate pages since the
      // proxy sets the request URL to the output's path for fallback pages
      if (pageIsDynamic && nowParams && defaultRouteRegex) {
        const _parsedUrl = parseUrl(req.url!)

        for (const param of Object.keys(defaultRouteRegex.groups)) {
          const { optional, repeat } = defaultRouteRegex.groups[param]
          let builtParam = `[${repeat ? '...' : ''}${param}]`

          if (optional) {
            builtParam = `[${builtParam}]`
          }

          const paramIdx = _parsedUrl.pathname!.indexOf(builtParam)

          if (paramIdx > -1) {
            _parsedUrl.pathname =
              _parsedUrl.pathname!.substr(0, paramIdx) +
              encodeURI((nowParams as any)[param] || '') +
              _parsedUrl.pathname!.substr(paramIdx + builtParam.length)
          }
        }
        parsedUrl.pathname = _parsedUrl.pathname
        req.url = formatUrl(_parsedUrl)
      }

      // make sure to normalize asPath for revalidate and _next/data requests
      // since the asPath should match what is shown on the client
      if (!fromExport && (getStaticProps || getServerSideProps)) {
        // don't include dynamic route params in query while normalizing
        // asPath
        if (pageIsDynamic && trustQuery && defaultRouteRegex) {
          delete (parsedUrl as any).search

          for (const param of Object.keys(defaultRouteRegex.groups)) {
            delete origQuery[param]
          }
        }

        parsedUrl.pathname = denormalizePagePath(parsedUrl.pathname!)
        renderOpts.resolvedUrl = formatUrl({
          ...parsedUrl,
          query: origQuery,
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
        // @ts-ignore
        renderOpts.fontManifest = __webpack_require__.__NEXT_FONT_MANIFEST__
      }
      let result = await renderToHTML(
        req,
        res,
        page,
        Object.assign(
          {},
          getStaticProps
            ? { ...(parsedUrl.query.amp ? { amp: '1' } : {}) }
            : parsedUrl.query,
          nowParams ? nowParams : params,
          _params,
          isFallback ? { __nextFallback: 'true' } : {}
        ),
        renderOpts
      )

      if (!renderMode) {
        if (_nextData || getStaticProps || getServerSideProps) {
          if (renderOpts.isNotFound) {
            res.statusCode = 404

            const NotFoundComponent = notFoundMod ? notFoundMod.default : Error
            const errPathname = notFoundMod ? '/404' : '/_error'

            const result2 = await renderToHTML(
              req,
              res,
              errPathname,
              parsedUrl.query,
              Object.assign({}, options, {
                getStaticProps: notFoundMod
                  ? notFoundMod.getStaticProps
                  : undefined,
                getStaticPaths: undefined,
                getServerSideProps: undefined,
                Component: NotFoundComponent,
                err: undefined,
                locale: detectedLocale,
                locales: i18n?.locales,
                defaultLocale: i18n?.defaultLocale,
              })
            )

            sendPayload(
              req,
              res,
              result2,
              'html',
              {
                generateEtags,
                poweredByHeader,
              },
              {
                private: isPreviewMode,
                stateful: !!getServerSideProps,
                revalidate: renderOpts.revalidate,
              }
            )
            return null
          } else if (renderOpts.isRedirect && !_nextData) {
            const redirect = {
              destination: renderOpts.pageData.pageProps.__N_REDIRECT,
              statusCode: renderOpts.pageData.pageProps.__N_REDIRECT_STATUS,
              basePath: renderOpts.pageData.pageProps.__N_REDIRECT_BASE_PATH,
            }
            const statusCode = getRedirectStatus(redirect)

            if (basePath && redirect.basePath !== false) {
              redirect.destination = `${basePath}${redirect.destination}`
            }

            if (statusCode === PERMANENT_REDIRECT_STATUS) {
              res.setHeader('Refresh', `0;url=${redirect.destination}`)
            }

            res.statusCode = statusCode
            res.setHeader('Location', redirect.destination)
            res.end()
            return null
          } else {
            sendPayload(
              req,
              res,
              _nextData ? JSON.stringify(renderOpts.pageData) : result,
              _nextData ? 'json' : 'html',
              {
                generateEtags,
                poweredByHeader,
              },
              {
                private: isPreviewMode,
                stateful: !!getServerSideProps,
                revalidate: renderOpts.revalidate,
              }
            )
            return null
          }
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
      if (!parsedUrl!) {
        parsedUrl = parseUrl(req.url!, true)
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
          await renderToHTML(
            req,
            res,
            '/_error',
            parsedUrl!.query,
            Object.assign({}, options, {
              getStaticProps: undefined,
              getStaticPaths: undefined,
              getServerSideProps: undefined,
              Component: Error,
              err: err,
              // Short-circuit rendering:
              isDataReq: true,
            })
          )
        } catch (underErrorErr) {
          console.error(
            'Failed call /_error subroutine, continuing to crash function:',
            underErrorErr
          )
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

      const result2 = await renderToHTML(
        req,
        res,
        '/_error',
        parsedUrl!.query,
        Object.assign({}, options, {
          getStaticProps: undefined,
          getStaticPaths: undefined,
          getServerSideProps: undefined,
          Component: Error,
          err: res.statusCode === 404 ? undefined : err,
        })
      )
      return result2
    }
  }

  return {
    renderReqToHTML,
    render: async function render(req: IncomingMessage, res: ServerResponse) {
      try {
        await initServer()
        const html = await renderReqToHTML(req, res)
        if (html) {
          sendPayload(req, res, html, 'html', {
            generateEtags,
            poweredByHeader,
          })
        }
      } catch (err) {
        console.error(err)
        await onError(err)
        // Throw the error to crash the serverless function
        throw err
      }
    },
  }
}
