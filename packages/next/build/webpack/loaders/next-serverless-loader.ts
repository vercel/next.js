import {loader} from 'webpack'
import {join} from 'path'
import {parse} from 'querystring'
import { BUILD_MANIFEST, REACT_LOADABLE_MANIFEST } from 'next-server/constants'

export type ServerlessLoaderQuery = {
  page: string,
  distDir: string,
  absolutePagePath: string,
  absoluteAppPath: string,
  absoluteDocumentPath: string,
  absoluteErrorPath: string,
  assetPrefix: string,
  ampBindInitData: boolean | string,
  generateEtags: string
  dynamicBuildId?: string | boolean
}

const nextServerlessLoader: loader.Loader = function () {
  const {
    distDir,
    absolutePagePath,
    page,
    assetPrefix,
    ampBindInitData,
    absoluteAppPath,
    absoluteDocumentPath,
    absoluteErrorPath,
    generateEtags,
    dynamicBuildId
  }: ServerlessLoaderQuery = typeof this.query === 'string' ? parse(this.query.substr(1)) : this.query
  const buildManifest = join(distDir, BUILD_MANIFEST).replace(/\\/g, '/')
  const reactLoadableManifest = join(distDir, REACT_LOADABLE_MANIFEST).replace(/\\/g, '/')
  return `
    import {parse} from 'url'
    import {renderToHTML} from 'next-server/dist/server/render';
    import {sendHTML} from 'next-server/dist/server/send-html';
    import buildManifest from '${buildManifest}';
    import reactLoadableManifest from '${reactLoadableManifest}';
    import Document from '${absoluteDocumentPath}';
    import Error from '${absoluteErrorPath}';
    import App from '${absoluteAppPath}';
    import Component from '${absolutePagePath}';
    export default Component
    export const _app = App
    export async function renderReqToHTML(req, res, fromExport) {
      const options = {
        App,
        Document,
        buildManifest,
        reactLoadableManifest,
        buildId: "__NEXT_REPLACE__BUILD_ID__",
        dynamicBuildId: ${dynamicBuildId === true || dynamicBuildId === 'true'},
        assetPrefix: "${assetPrefix}",
        ampBindInitData: ${ampBindInitData === true || ampBindInitData === 'true'}
      }
      const parsedUrl = parse(req.url, true)
      const renderOpts = Object.assign(
        {
          Component,
          dataOnly: req.headers && (req.headers.accept || '').indexOf('application/amp.bind+json') !== -1,
        },
        options,
      )
      try {
        ${page === '/_error' ? `res.statusCode = 404` : ''}
        const result = await renderToHTML(req, res, "${page}", parsedUrl.query, renderOpts)

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

export default nextServerlessLoader
