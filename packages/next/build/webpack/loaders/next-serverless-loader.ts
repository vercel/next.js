import { loader } from 'webpack'
import { join } from 'path'
import { parse } from 'querystring'
import {
  BUILD_MANIFEST,
  ROUTES_MANIFEST,
  REACT_LOADABLE_MANIFEST,
} from '../../../next-server/lib/constants'
import { isDynamicRoute } from '../../../next-server/lib/router/utils'
import { API_ROUTE } from '../../../lib/constants'

export type ServerlessLoaderQuery = {
  page: string
  distDir: string
  absolutePagePath: string
  absoluteAppPath: string
  absoluteDocumentPath: string
  absoluteErrorPath: string
  buildId: string
  assetPrefix: string
  ampBindInitData: boolean | string
  generateEtags: string
  canonicalBase: string
}

const nextServerlessLoader: loader.Loader = function() {
  const {
    distDir,
    absolutePagePath,
    page,
    buildId,
    canonicalBase,
    assetPrefix,
    ampBindInitData,
    absoluteAppPath,
    absoluteDocumentPath,
    absoluteErrorPath,
    generateEtags,
  }: ServerlessLoaderQuery =
    typeof this.query === 'string' ? parse(this.query.substr(1)) : this.query
  const buildManifest = join(distDir, BUILD_MANIFEST).replace(/\\/g, '/')
  const reactLoadableManifest = join(distDir, REACT_LOADABLE_MANIFEST).replace(
    /\\/g,
    '/'
  )
  const routesManifest = join(distDir, ROUTES_MANIFEST).replace(/\\/g, '/')

  const escapedBuildId = buildId.replace(/[|\\{}()[\]^$+*?.-]/g, '\\$&')
  const pageIsDynamicRoute = isDynamicRoute(page)

  const dynamicRouteImports = pageIsDynamicRoute
    ? `
    import { getRouteMatcher } from 'next/dist/next-server/lib/router/utils/route-matcher';
      import { getRouteRegex } from 'next/dist/next-server/lib/router/utils/route-regex';
  `
    : ''

  const dynamicRouteMatcher = pageIsDynamicRoute
    ? `
    const dynamicRouteMatcher = getRouteMatcher(getRouteRegex("${page}"))
  `
    : ''

  const rewriteImports = `
    import { rewrites } from '${routesManifest}'
    import pathMatch, { pathToRegexp } from 'next/dist/next-server/server/lib/path-match'
  `

  const handleRewrites = `
    const getCustomRouteMatcher = pathMatch(true)

    function handleRewrites(parsedUrl) {
      for (const rewrite of rewrites) {
        const matcher = getCustomRouteMatcher(rewrite.source)
        const params = matcher(parsedUrl.pathname)

        if (params) {
          parsedUrl.query = {
            ...parsedUrl.query,
            ...params
          }
          const parsedDest = parse(rewrite.destination)
          const destCompiler = pathToRegexp.compile(
            \`\${parsedDest.pathname}\${parsedDest.hash || ''}\`
          )
          const newUrl = destCompiler(params)
          const parsedNewUrl = parse(newUrl)

          parsedUrl.pathname = parsedNewUrl.pathname
          parsedUrl.hash = parsedNewUrl.hash

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
      ${dynamicRouteImports}
      import { parse } from 'url'
      import { apiResolver } from 'next/dist/next-server/server/api-utils'
      import initServer from 'next-plugin-loader?middleware=on-init-server!'
      import onError from 'next-plugin-loader?middleware=on-error-server!'
      ${rewriteImports}

      ${dynamicRouteMatcher}
      ${handleRewrites}

      export default async (req, res) => {
        try {
          await initServer()
          const parsedUrl = parse(req.url, true)

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
    import {parse} from 'url'
    import {parse as parseQs} from 'querystring'
    import {renderToHTML} from 'next/dist/next-server/server/render';
    import {sendHTML} from 'next/dist/next-server/server/send-html';
    import initServer from 'next-plugin-loader?middleware=on-init-server!'
    import onError from 'next-plugin-loader?middleware=on-error-server!'
    import buildManifest from '${buildManifest}';
    import reactLoadableManifest from '${reactLoadableManifest}';
    import Document from '${absoluteDocumentPath}';
    import Error from '${absoluteErrorPath}';
    import App from '${absoluteAppPath}';
    import * as ComponentInfo from '${absolutePagePath}';
    ${dynamicRouteImports}
    ${rewriteImports}

    const Component = ComponentInfo.default
    export default Component
    export const unstable_getStaticProps = ComponentInfo['unstable_getStaticProp' + 's']
    export const unstable_getStaticParams = ComponentInfo['unstable_getStaticParam' + 's']
    export const unstable_getStaticPaths = ComponentInfo['unstable_getStaticPath' + 's']

    ${dynamicRouteMatcher}
    ${handleRewrites}

    export const config = ComponentInfo['confi' + 'g'] || {}
    export const _app = App
    export async function renderReqToHTML(req, res, fromExport, _renderOpts, _params) {
      const options = {
        App,
        Document,
        buildManifest,
        unstable_getStaticProps,
        unstable_getStaticPaths,
        reactLoadableManifest,
        canonicalBase: "${canonicalBase}",
        buildId: "${buildId}",
        assetPrefix: "${assetPrefix}",
        ampBindInitData: ${ampBindInitData === true ||
          ampBindInitData === 'true'},
        ..._renderOpts
      }
      let sprData = false

      if (req.url.match(/_next\\/data/)) {
        sprData = true
        req.url = req.url
          .replace(new RegExp('/_next/data/${escapedBuildId}/'), '/')
          .replace(/\\.json$/, '')
      }
      const parsedUrl = handleRewrites(parse(req.url, true))

      const renderOpts = Object.assign(
        {
          Component,
          pageConfig: config,
          dataOnly: req.headers && (req.headers.accept || '').indexOf('application/amp.bind+json') !== -1,
          nextExport: fromExport
        },
        options,
      )
      try {
        ${page === '/_error' ? `res.statusCode = 404` : ''}
        ${
          pageIsDynamicRoute
            ? `const params = fromExport && !unstable_getStaticProps ? {} : dynamicRouteMatcher(parsedUrl.pathname) || {};`
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
                                [key]: encodeURIComponent(obj[key])
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
        let result = await renderToHTML(req, res, "${page}", Object.assign({}, unstable_getStaticProps ? {} : parsedUrl.query, nowParams ? nowParams : params, _params), renderOpts)

        if (sprData && !fromExport) {
          const payload = JSON.stringify(renderOpts.sprData)
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Content-Length', Buffer.byteLength(payload))
          res.setHeader(
            'Cache-Control',
            \`s-maxage=\${renderOpts.revalidate}, stale-while-revalidate\`
          )
          res.end(payload)
          return null
        }

        if (fromExport) return { html: result, renderOpts }
        return result
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.statusCode = 404
          const result = await renderToHTML(req, res, "/_error", parsedUrl.query, Object.assign({}, options, {
            unstable_getStaticProps: undefined,
            unstable_getStaticPaths: undefined,
            Component: Error
          }))
          return result
        } else {
          console.error(err)
          res.statusCode = 500
          const result = await renderToHTML(req, res, "/_error", parsedUrl.query, Object.assign({}, options, {
            unstable_getStaticProps: undefined,
            unstable_getStaticPaths: undefined,
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
