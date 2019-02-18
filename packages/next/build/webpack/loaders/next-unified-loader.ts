import { loader } from 'webpack';
import { join } from 'path';
import { parse } from 'querystring';
import { BUILD_MANIFEST, REACT_LOADABLE_MANIFEST } from 'next-server/constants';

export type UnifiedLoaderQuery = {
  pages: string
  distDir: string
  absolutePagePaths: string
  absoluteAppPath: string
  absoluteDocumentPath: string
  absoluteErrorPath: string
  buildId: string
  assetPrefix: string
}

const nextUnifiedLoader: loader.Loader = function() {
  const {distDir, absolutePagePaths, pages, buildId, assetPrefix, absoluteAppPath, absoluteDocumentPath, absoluteErrorPath}: UnifiedLoaderQuery =
    typeof this.query === 'string' ? parse(this.query.substr(1)) : this.query
  const buildManifest = join(distDir, BUILD_MANIFEST).replace(/\\/g, '/')
  const reactLoadableManifest = join(distDir, REACT_LOADABLE_MANIFEST).replace(/\\/g, '/')
  const parsedPagePaths = absolutePagePaths.split(',')
  const parsedPages = pages.split(',')
  return `
    import {renderToHTML} from 'next-server/dist/server/render'
    import buildManifest from '${buildManifest}'
    import reactLoadableManifest from '${reactLoadableManifest}'
    import Document from '${absoluteDocumentPath}'
    import Error from '${absoluteErrorPath}'
    import App from '${absoluteAppPath}'
    ${parsedPagePaths
      .map(
        (absolutePagePath, index) =>
          `import page${index} from '${absolutePagePath}'`,
      )
      .join('\n')}

    const errorPage = '/_error'
    const routes = ${JSON.stringify(
      Object.assign(
        {},
        ...parsedPages.map((page, index) => ({ [page]: `page${index}` })),
      ),
    ).replace(/"(page\d+)"/g, '$1')}

    function matchRoute(url) {
      let page = '/index'
      if (url === '/' && routes.hasOwnProperty(page)) {
        return [page, routes[page]]
      }
      if (routes.hasOwnProperty(url)) {
        return [url, routes[url]]
      }

      const splitUrl = url.split('/');
      for (let i = splitUrl.length; i > 0; i--) {
        const currentPrefix = splitUrl.slice(0, i).join('/')

        if (routes.hasOwnProperty(currentPrefix)) {
          return [currentPrefix, routes[currentPrefix]]
        }
      }

      return [errorPage, routes[errorPage]]
    };

    const errorResponse = { status: 500, body: 'Internal Server Error', headers: {} }

    export async function render(url, query = {}, reqHeaders = {}) {
      const req = {
        headers: reqHeaders,
        method: 'GET',
        url
      }
      const [page, Component] = matchRoute(url)
      const headers = {}
      let body = ''
      const res = {
        statusCode: 200,
        finished: false,
        headersSent: false,
        setHeader(name, value) {
          headers[name.toLowerCase()] = value
        },
        getHeader(name) {
          return headers[name.toLowerCase()]
        }
      };
      const options = {
        App,
        Document,
        buildManifest,
        reactLoadableManifest,
        buildId: ${JSON.stringify(buildId)},
        assetPrefix: ${JSON.stringify(assetPrefix)},
        Component
      }
      try {
        if (page === '/_error') {
          res.statusCode = 404
        }
        body = await renderToHTML(req, res, page, query, Object.assign({}, options))
      } catch (err) {
        if (err.code === 'ENOENT') {
          res.statusCode = 404
          body = await renderToHTML(req, res, "/_error", query, Object.assign({}, options, {
            Component: Error
          }))
        } else {
          console.error(err)
          try {
            res.statusCode = 500
            body = await renderToHTML(req, res, "/_error", query, Object.assign({}, options, {
              Component: Error,
              err
            }))
          } catch (e) {
            console.error(e)
            return errorResponse; // non-html fatal/fallback error
          }
        }
      }
      return {
        status: res.statusCode,
        headers: Object.assign({
          'content-type': 'text/html; charset=utf-8',
          'content-length': Buffer.byteLength(body)
        }, headers),
        body
      }
    }
  `;
};

export default nextUnifiedLoader;
