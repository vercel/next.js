import {loader} from 'webpack'
import {join} from 'path'
import {parse} from 'querystring'
import { BUILD_MANIFEST, REACT_LOADABLE_MANIFEST } from 'next-server/constants'

type Query = {
  page: string,
  distDir: string,
  absolutePagePath: string,
  buildId: string,
  assetPrefix: string
}

const nextServerlessLoader: loader.Loader = function () {
  const {distDir, absolutePagePath, page, buildId, assetPrefix}: Query = typeof this.query === 'string' ? parse(this.query) : this.query
  const buildManifest = join(distDir, BUILD_MANIFEST)
  const reactLoadableManifest = join(distDir, REACT_LOADABLE_MANIFEST)
  return `
    import {parse} from 'url'
    import {renderToHTML} from 'next-server/dist/server/render';
    import buildManifest from '${buildManifest}';
    import reactLoadableManifest from '${reactLoadableManifest}';
    import Document from 'next/dist/pages/_document';
    import Error from 'next/dist/pages/_error';
    import App from 'next/dist/pages/_app';
    import Component from '${absolutePagePath}';
    module.exports = async (req, res) => {
      try {
        const options = {
          App,
          Document,
          buildManifest,
          reactLoadableManifest,
          buildId: "${buildId}",
          assetPrefix: "${assetPrefix}"
        }
        const parsedUrl = parse(req.url, true)
        try {
          const result = await renderToHTML(req, res, "${page}", parsedUrl.query, {
            ...options,
            Component
          })
          return result
        } catch (err) {
          if (err.code === 'ENOENT') {
            res.statusCode = 404
            const result = await renderToHTML(req, res, "/_error", parsedUrl.query, {
              ...options,
              Component: Error
            })
            return result
          } else {
            console.error(err)
            res.statusCode = 500
            const result = await renderToHTML(req, res, "/_error", parsedUrl.query, {
              ...options,
              Component: Error,
              err
            })
            return result
          }
        }
      } catch(err) {
        console.error(err)
        res.statusCode = 500
        res.end('Internal Server Error')
      }
    }
  `
}

export default nextServerlessLoader
