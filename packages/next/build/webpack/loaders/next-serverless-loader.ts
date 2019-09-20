import { loader } from 'webpack'
import { join } from 'path'
import { parse } from 'querystring'
import {
  BUILD_MANIFEST,
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

  if (page.match(API_ROUTE)) {
    return `
    ${
      isDynamicRoute(page)
        ? `
      import { getRouteMatcher } from 'next/dist/next-server/lib/router/utils/route-matcher';
      import { getRouteRegex } from 'next/dist/next-server/lib/router/utils/route-regex';
      `
        : ``
    }
      import { parse } from 'url'
      import { apiResolver } from 'next/dist/next-server/server/api-utils'

      export default (req, res) => {
        const params = ${
          isDynamicRoute(page)
            ? `getRouteMatcher(getRouteRegex('${page}'))(parse(req.url).pathname)`
            : `{}`
        }
        const resolver = require('${absolutePagePath}')
        apiResolver(req, res, params, resolver)
      }
    `
  } else {
    return `
    import {parse} from 'url'
    import {renderToHTML} from 'next/dist/next-server/server/render';
    import {sendHTML} from 'next/dist/next-server/server/send-html';
    ${
      isDynamicRoute(page)
        ? `import {getRouteMatcher, getRouteRegex} from 'next/dist/next-server/lib/router/utils';`
        : ''
    }
    import buildManifest from '${buildManifest}';
    import reactLoadableManifest from '${reactLoadableManifest}';
    import Document from '${absoluteDocumentPath}';
    import Error from '${absoluteErrorPath}';
    import App from '${absoluteAppPath}';
    import * as ComponentInfo from '${absolutePagePath}';
    const Component = ComponentInfo.default
    export default Component
    export const unstable_getStaticProps = ComponentInfo['unstable_getStaticProp' + 's']
    ${
      isDynamicRoute(page)
        ? "export const unstable_getStaticParams = ComponentInfo['unstable_getStaticParam' + 's']"
        : ''
    }
    export const config = ComponentInfo['confi' + 'g'] || {}
    export const _app = App
    export async function renderReqToHTML(req, res, fromExport) {
      const options = {
        App,
        Document,
        buildManifest,
        unstable_getStaticProps,
        reactLoadableManifest,
        canonicalBase: "${canonicalBase}",
        buildId: "${buildId}",
        assetPrefix: "${assetPrefix}",
        ampBindInitData: ${ampBindInitData === true ||
          ampBindInitData === 'true'},
      }
      let sprData = false

      if (req.url.match(/_next\\/data/)) {
        sprData = true
        req.url = req.url
          .replace(/\\/_next\\/data\\//, '/')
          .replace(/\\.json$/, '')
      }
      const parsedUrl = parse(req.url, true)
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
          isDynamicRoute(page)
            ? `const params = fromExport && !unstable_getStaticProps ? {} : getRouteMatcher(getRouteRegex("${page}"))(parsedUrl.pathname) || {};`
            : `const params = {};`
        }
        const result = await renderToHTML(req, res, "${page}", Object.assign({}, unstable_getStaticProps ? {} : parsedUrl.query, params, sprData ? { _nextSprData: '1' } : {}), renderOpts)

        if (fromExport) return { html: result, renderOpts }
        return result
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.statusCode = 404
          const result = await renderToHTML(req, res, "/_error", parsedUrl.query, Object.assign({}, options, {
            Component: Error
          }))
          return result
        } else {
          console.error(err)
          res.statusCode = 500
          const result = await renderToHTML(req, res, "/_error", parsedUrl.query, Object.assign({}, options, {
            Component: Error,
            err
          }))
          return result
        }
      }
    }
    export async function render (req, res) {
      try {
        const html = await renderReqToHTML(req, res)
        sendHTML(req, res, html, {generateEtags: ${generateEtags}})
      } catch(err) {
        console.error(err)
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    }
  `
  }
}

export default nextServerlessLoader
