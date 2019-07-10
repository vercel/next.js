import mkdirpModule from 'mkdirp'
import { promisify } from 'util'
import { extname, join, dirname, sep } from 'path'
import { renderToHTML } from 'next-server/dist/server/render'
import { writeFile, access, readFile } from 'fs'
import { Sema } from 'async-sema'
import AmpHtmlValidator from 'amphtml-validator'
import { loadComponents } from 'next-server/dist/server/load-components'
import { inlineGipIdentifier } from '../build/babel/plugins/next-page-config'
import { isDynamicRoute } from 'next-server/dist/lib/router/utils/is-dynamic'
import { getRouteMatcher } from 'next-server/dist/lib/router/utils/route-matcher'
import { getRouteRegex } from 'next-server/dist/lib/router/utils/route-regex'

const envConfig = require('next-server/config')
const mkdirp = promisify(mkdirpModule)
const writeFileP = promisify(writeFile)
const readFileP = promisify(readFile)
const accessP = promisify(access)

global.__NEXT_DATA__ = {
  nextExport: true
}

process.on(
  'message',
  async ({
    distDir,
    buildId,
    exportPaths,
    exportPathMap,
    outDir,
    renderOpts,
    serverRuntimeConfig,
    concurrency,
    subFolders,
    serverless
  }) => {
    const sema = new Sema(concurrency, { capacity: exportPaths.length })
    try {
      const work = async path => {
        await sema.acquire()
        const ampPath = `${path === '/' ? '/index' : path}.amp`
        const { page } = exportPathMap[path]
        let { query = {} } = exportPathMap[path]

        // Check if the page is a specified dynamic route
        if (isDynamicRoute(page) && page !== path) {
          const params = getRouteMatcher(getRouteRegex(page))(path)
          if (params) {
            query = {
              ...query,
              ...params
            }
          } else {
            throw new Error(
              `The provided export path '${path}' doesn't match the '${page}' page.\nRead more: https://err.sh/zeit/next.js/export-path-mismatch`
            )
          }
        }

        const headerMocks = {
          headers: {},
          getHeader: () => ({}),
          setHeader: () => {},
          hasHeader: () => false,
          removeHeader: () => {},
          getHeaderNames: () => []
        }

        const req = {
          url: path,
          ...headerMocks
        }
        const res = {
          ...headerMocks
        }

        envConfig.setConfig({
          serverRuntimeConfig,
          publicRuntimeConfig: renderOpts.runtimeConfig
        })

        let htmlFilename = `${path}${sep}index.html`

        if (!subFolders) htmlFilename = `${path}.html`

        const pageExt = extname(page)
        const pathExt = extname(path)
        // Make sure page isn't a folder with a dot in the name e.g. `v1.2`
        if (pageExt !== pathExt && pathExt !== '') {
          // If the path has an extension, use that as the filename instead
          htmlFilename = path
        } else if (path === '/') {
          // If the path is the root, just use index.html
          htmlFilename = 'index.html'
        }
        const baseDir = join(outDir, dirname(htmlFilename))
        const htmlFilepath = join(outDir, htmlFilename)

        await mkdirp(baseDir)
        let html
        let curRenderOpts = {}
        let renderMethod = renderToHTML

        if (serverless) {
          renderMethod = require(join(
            distDir,
            'serverless/pages',
            (page === '/' ? 'index' : page) + '.js'
          )).renderReqToHTML
          const result = await renderMethod(req, res, true)
          curRenderOpts = result.renderOpts
          html = result.html
        } else {
          const components = await loadComponents(
            distDir,
            buildId,
            page,
            serverless
          )

          if (typeof components.Component === 'string') {
            html = components.Component
          } else {
            curRenderOpts = { ...components, ...renderOpts, ampPath }
            html = await renderMethod(req, res, page, query, curRenderOpts)
          }
        }

        // inline pageData for getInitialProps
        if (curRenderOpts.isPrerender && curRenderOpts.pageData) {
          const dataStr = JSON.stringify(curRenderOpts.pageData)
            .replace(/"/g, '\\"')
            .replace(/'/g, "\\'")

          const bundlePath = join(
            distDir,
            'static',
            buildId,
            'pages',
            (path === '/' ? 'index' : path) + '.js'
          )

          const bundleContent = await readFileP(bundlePath, 'utf8')
          await writeFileP(
            bundlePath,
            bundleContent.replace(inlineGipIdentifier, dataStr)
          )
        }

        const validateAmp = async (html, page) => {
          const validator = await AmpHtmlValidator.getInstance()
          const result = validator.validateString(html)
          const errors = result.errors.filter(e => e.severity === 'ERROR')
          const warnings = result.errors.filter(e => e.severity !== 'ERROR')

          if (warnings.length || errors.length) {
            process.send({
              type: 'amp-validation',
              payload: {
                page,
                result: {
                  errors,
                  warnings
                }
              }
            })
          }
        }

        if (curRenderOpts.inAmpMode) {
          await validateAmp(html, path)
        } else if (curRenderOpts.hybridAmp) {
          // we need to render the AMP version
          let ampHtmlFilename = `${ampPath}${sep}index.html`
          if (!subFolders) {
            ampHtmlFilename = `${ampPath}.html`
          }
          const ampBaseDir = join(outDir, dirname(ampHtmlFilename))
          const ampHtmlFilepath = join(outDir, ampHtmlFilename)

          try {
            await accessP(ampHtmlFilepath)
          } catch (_) {
            // make sure it doesn't exist from manual mapping
            let ampHtml
            if (serverless) {
              req.url += (req.url.includes('?') ? '&' : '?') + 'amp=1'
              ampHtml = (await renderMethod(req, res, true)).html
            } else {
              ampHtml = await renderMethod(
                req,
                res,
                page,
                { ...query, amp: 1 },
                curRenderOpts
              )
            }

            await validateAmp(ampHtml, page + '?amp=1')
            await mkdirp(ampBaseDir)
            await writeFileP(ampHtmlFilepath, ampHtml, 'utf8')
          }
        }

        await writeFileP(htmlFilepath, html, 'utf8')
        process.send({ type: 'progress' })
        sema.release()
      }
      await Promise.all(exportPaths.map(work))
      process.send({ type: 'done' })
    } catch (err) {
      console.error(err)
      process.send({ type: 'error', payload: err })
    }
  }
)
