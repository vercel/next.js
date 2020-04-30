import { promisify } from 'util'
import url from 'url'
import { extname, join, dirname, sep } from 'path'
import { renderToHTML } from '../next-server/server/render'
import { access, mkdir as mkdirOrig, writeFile } from 'fs'
import AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'
import { loadComponents } from '../next-server/server/load-components'
import { isDynamicRoute } from '../next-server/lib/router/utils/is-dynamic'
import { getRouteMatcher } from '../next-server/lib/router/utils/route-matcher'
import { getRouteRegex } from '../next-server/lib/router/utils/route-regex'
import { normalizePagePath } from '../next-server/server/normalize-page-path'
import { SERVER_PROPS_EXPORT_ERROR } from '../lib/constants'
import fetch from 'next/dist/compiled/node-fetch'

// @ts-ignore fetch exists globally
if (!global.fetch) {
  // Polyfill fetch() in the Node.js environment
  // @ts-ignore fetch exists globally
  global.fetch = fetch
}

const envConfig = require('../next-server/lib/runtime-config')
const writeFileP = promisify(writeFile)
const accessP = promisify(access)
const mkdir = promisify(mkdirOrig)

global.__NEXT_DATA__ = {
  nextExport: true,
}

export default async function({
  path,
  pathMap,
  distDir,
  buildId,
  outDir,
  pagesDataDir,
  renderOpts,
  buildExport,
  serverRuntimeConfig,
  subFolders,
  serverless,
}) {
  let results = {
    ampValidations: [],
  }

  try {
    const { query: originalQuery = {} } = pathMap
    const { page } = pathMap
    const filePath = normalizePagePath(path)
    const ampPath = `${filePath}.amp`
    let query = { ...originalQuery }
    let params

    // We need to show a warning if they try to provide query values
    // for an auto-exported page since they won't be available
    const hasOrigQueryValues = Object.keys(originalQuery).length > 0
    const queryWithAutoExportWarn = () => {
      if (hasOrigQueryValues) {
        throw new Error(
          `\nError: you provided query values for ${path} which is an auto-exported page. These can not be applied since the page can no longer be re-rendered on the server. To disable auto-export for this page add \`getInitialProps\`\n`
        )
      }
    }

    // Check if the page is a specified dynamic route
    if (isDynamicRoute(page) && page !== path) {
      params = getRouteMatcher(getRouteRegex(page))(path)
      if (params) {
        // we have to pass these separately for serverless
        if (!serverless) {
          query = {
            ...query,
            ...params,
          }
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
      getHeaderNames: () => [],
    }

    const req = {
      url: path,
      ...headerMocks,
    }
    const res = {
      ...headerMocks,
    }

    envConfig.setConfig({
      serverRuntimeConfig,
      publicRuntimeConfig: renderOpts.runtimeConfig,
    })

    let htmlFilename = `${filePath}${sep}index.html`
    if (!subFolders) htmlFilename = `${filePath}.html`

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
    let htmlFilepath = join(outDir, htmlFilename)

    await mkdir(baseDir, { recursive: true })
    let html
    let curRenderOpts = {}
    let renderMethod = renderToHTML

    const renderedDuringBuild = getStaticProps => {
      return !buildExport && getStaticProps && !isDynamicRoute(path)
    }

    if (serverless) {
      const curUrl = url.parse(req.url, true)
      req.url = url.format({
        ...curUrl,
        query: {
          ...curUrl.query,
          ...query,
        },
      })
      const { Component: mod, getServerSideProps } = await loadComponents(
        distDir,
        buildId,
        page,
        serverless
      )

      if (getServerSideProps) {
        throw new Error(`Error for page ${page}: ${SERVER_PROPS_EXPORT_ERROR}`)
      }

      // if it was auto-exported the HTML is loaded here
      if (typeof mod === 'string') {
        html = mod
        queryWithAutoExportWarn()
      } else {
        // for non-dynamic SSG pages we should have already
        // prerendered the file
        if (renderedDuringBuild(mod.getStaticProps)) return results

        if (mod.getStaticProps && !htmlFilepath.endsWith('.html')) {
          // make sure it ends with .html if the name contains a dot
          htmlFilename += '.html'
          htmlFilepath += '.html'
        }

        renderMethod = mod.renderReqToHTML
        const result = await renderMethod(
          req,
          res,
          'export',
          { ampPath },
          params
        )
        curRenderOpts = result.renderOpts || {}
        html = result.html
      }

      if (!html) {
        throw new Error(`Failed to render serverless page`)
      }
    } else {
      const components = await loadComponents(
        distDir,
        buildId,
        page,
        serverless
      )

      if (components.getServerSideProps) {
        throw new Error(`Error for page ${page}: ${SERVER_PROPS_EXPORT_ERROR}`)
      }

      // for non-dynamic SSG pages we should have already
      // prerendered the file
      if (renderedDuringBuild(components.getStaticProps)) {
        return results
      }

      // TODO: de-dupe the logic here between serverless and server mode
      if (components.getStaticProps && !htmlFilepath.endsWith('.html')) {
        // make sure it ends with .html if the name contains a dot
        htmlFilepath += '.html'
        htmlFilename += '.html'
      }

      if (typeof components.Component === 'string') {
        html = components.Component
        queryWithAutoExportWarn()
      } else {
        curRenderOpts = { ...components, ...renderOpts, ampPath, params }
        html = await renderMethod(req, res, page, query, curRenderOpts)
      }
    }

    const validateAmp = async (html, page, validatorPath) => {
      const validator = await AmpHtmlValidator.getInstance(validatorPath)
      const result = validator.validateString(html)
      const errors = result.errors.filter(e => e.severity === 'ERROR')
      const warnings = result.errors.filter(e => e.severity !== 'ERROR')

      if (warnings.length || errors.length) {
        results.ampValidations.push({
          page,
          result: {
            errors,
            warnings,
          },
        })
      }
    }

    if (curRenderOpts.inAmpMode && !curRenderOpts.ampSkipValidation) {
      await validateAmp(html, path, curRenderOpts.ampValidatorPath)
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
          ampHtml = (await renderMethod(req, res, 'export')).html
        } else {
          ampHtml = await renderMethod(
            req,
            res,
            page,
            { ...query, amp: 1 },
            curRenderOpts
          )
        }

        if (!curRenderOpts.ampSkipValidation) {
          await validateAmp(ampHtml, page + '?amp=1')
        }
        await mkdir(ampBaseDir, { recursive: true })
        await writeFileP(ampHtmlFilepath, ampHtml, 'utf8')
      }
    }

    if (curRenderOpts.pageData) {
      const dataFile = join(
        pagesDataDir,
        htmlFilename.replace(/\.html$/, '.json')
      )

      await mkdir(dirname(dataFile), { recursive: true })
      await writeFileP(dataFile, JSON.stringify(curRenderOpts.pageData), 'utf8')
    }
    results.fromBuildExportRevalidate = curRenderOpts.revalidate

    await writeFileP(htmlFilepath, html, 'utf8')
    return results
  } catch (error) {
    console.error(
      `\nError occurred prerendering page "${path}". Read more: https://err.sh/next.js/prerender-error:\n` +
        error
    )
    return { ...results, error: true }
  }
}
