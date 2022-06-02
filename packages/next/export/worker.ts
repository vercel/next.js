import type { ComponentType } from 'react'
import type { FontManifest } from '../server/font-utils'
import type { GetStaticProps } from '../types'
import type { IncomingMessage, ServerResponse } from 'http'
import type { NextConfigComplete } from '../server/config-shared'
import type { NextParsedUrlQuery } from '../server/request-meta'
import url from 'url'
import { extname, join, dirname, sep } from 'path'
import { renderToHTML } from '../server/render'
import { promises } from 'fs'
import AmpHtmlValidator from 'next/dist/compiled/amphtml-validator'
import { loadComponents } from '../server/load-components'
import { isDynamicRoute } from '../shared/lib/router/utils/is-dynamic'
import { getRouteMatcher } from '../shared/lib/router/utils/route-matcher'
import { getRouteRegex } from '../shared/lib/router/utils/route-regex'
import { normalizePagePath } from '../shared/lib/page-path/normalize-page-path'
import { SERVER_PROPS_EXPORT_ERROR } from '../lib/constants'
import '../server/node-polyfill-fetch'
import { requireFontManifest } from '../server/require'
import { normalizeLocalePath } from '../shared/lib/i18n/normalize-locale-path'
import { trace } from '../trace'
import { isInAmpMode } from '../shared/lib/amp-mode'
import { setHttpAgentOptions } from '../server/config'
import RenderResult from '../server/render-result'
import isError from '../lib/is-error'

const envConfig = require('../shared/lib/runtime-config')

;(global as any).__NEXT_DATA__ = {
  nextExport: true,
}

interface AmpValidation {
  page: string
  result: {
    errors: AmpHtmlValidator.ValidationError[]
    warnings: AmpHtmlValidator.ValidationError[]
  }
}

interface PathMap {
  page: string
  query?: NextParsedUrlQuery
}

interface ExportPageInput {
  path: string
  pathMap: PathMap
  distDir: string
  outDir: string
  pagesDataDir: string
  renderOpts: RenderOpts
  buildExport?: boolean
  serverRuntimeConfig: { [key: string]: any }
  subFolders?: boolean
  serverless: boolean
  optimizeFonts: boolean
  optimizeCss: any
  disableOptimizedLoading: any
  parentSpanId: any
  httpAgentOptions: NextConfigComplete['httpAgentOptions']
  serverComponents?: boolean
  appDir?: boolean
}

interface ExportPageResults {
  ampValidations: AmpValidation[]
  fromBuildExportRevalidate?: number
  error?: boolean
  ssgNotFound?: boolean
  duration: number
}

interface RenderOpts {
  runtimeConfig?: { [key: string]: any }
  params?: { [key: string]: string | string[] }
  ampPath?: string
  ampValidatorPath?: string
  ampSkipValidation?: boolean
  optimizeFonts?: boolean
  disableOptimizedLoading?: boolean
  optimizeCss?: any
  fontManifest?: FontManifest
  locales?: string[]
  locale?: string
  defaultLocale?: string
  trailingSlash?: boolean
  appDir?: boolean
}

type ComponentModule = ComponentType<{}> & {
  renderReqToHTML: typeof renderToHTML
  getStaticProps?: GetStaticProps
}

export default async function exportPage({
  parentSpanId,
  path,
  pathMap,
  distDir,
  outDir,
  appDir,
  pagesDataDir,
  renderOpts,
  buildExport,
  serverRuntimeConfig,
  subFolders,
  serverless,
  optimizeFonts,
  optimizeCss,
  disableOptimizedLoading,
  httpAgentOptions,
  serverComponents,
}: ExportPageInput): Promise<ExportPageResults> {
  setHttpAgentOptions(httpAgentOptions)
  const exportPageSpan = trace('export-page-worker', parentSpanId)

  return exportPageSpan.traceAsyncFn(async () => {
    const start = Date.now()
    let results: Omit<ExportPageResults, 'duration'> = {
      ampValidations: [],
    }

    try {
      const { query: originalQuery = {} } = pathMap
      const { page } = pathMap
      const filePath = normalizePagePath(path)
      const isDynamic = isDynamicRoute(page)
      const ampPath = `${filePath}.amp`
      let renderAmpPath = ampPath
      let query = { ...originalQuery }
      let params: { [key: string]: string | string[] } | undefined

      let updatedPath = query.__nextSsgPath || path
      let locale = query.__nextLocale || renderOpts.locale
      delete query.__nextLocale
      delete query.__nextSsgPath

      if (renderOpts.locale) {
        const localePathResult = normalizeLocalePath(path, renderOpts.locales)

        if (localePathResult.detectedLocale) {
          updatedPath = localePathResult.pathname
          locale = localePathResult.detectedLocale

          if (locale === renderOpts.defaultLocale) {
            renderAmpPath = `${normalizePagePath(updatedPath)}.amp`
          }
        }
      }

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
      const nonLocalizedPath = normalizeLocalePath(
        path,
        renderOpts.locales
      ).pathname

      if (isDynamic && page !== nonLocalizedPath) {
        params = getRouteMatcher(getRouteRegex(page))(updatedPath) || undefined
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
            `The provided export path '${updatedPath}' doesn't match the '${page}' page.\nRead more: https://nextjs.org/docs/messages/export-path-mismatch`
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
        url: updatedPath,
        ...headerMocks,
      } as unknown as IncomingMessage
      const res = {
        ...headerMocks,
      } as unknown as ServerResponse

      if (updatedPath === '/500' && page === '/_error') {
        res.statusCode = 500
      }

      if (renderOpts.trailingSlash && !req.url?.endsWith('/')) {
        req.url += '/'
      }

      envConfig.setConfig({
        serverRuntimeConfig,
        publicRuntimeConfig: renderOpts.runtimeConfig,
      })

      const getHtmlFilename = (_path: string) =>
        subFolders ? `${_path}${sep}index.html` : `${_path}.html`
      let htmlFilename = getHtmlFilename(filePath)

      // dynamic routes can provide invalid extensions e.g. /blog/[...slug] returns an
      // extension of `.slug]`
      const pageExt = isDynamic ? '' : extname(page)
      const pathExt = isDynamic ? '' : extname(path)

      // force output 404.html for backwards compat
      if (path === '/404.html') {
        htmlFilename = path
      }
      // Make sure page isn't a folder with a dot in the name e.g. `v1.2`
      else if (pageExt !== pathExt && pathExt !== '') {
        const isBuiltinPaths = ['/500', '/404'].some(
          (p) => p === path || p === path + '.html'
        )
        // If the ssg path has .html extension, and it's not builtin paths, use it directly
        // Otherwise, use that as the filename instead
        const isHtmlExtPath =
          !serverless && !isBuiltinPaths && path.endsWith('.html')
        htmlFilename = isHtmlExtPath ? getHtmlFilename(path) : path
      } else if (path === '/') {
        // If the path is the root, just use index.html
        htmlFilename = 'index.html'
      }

      const baseDir = join(outDir, dirname(htmlFilename))
      let htmlFilepath = join(outDir, htmlFilename)

      await promises.mkdir(baseDir, { recursive: true })
      let renderResult
      let curRenderOpts: RenderOpts = {}
      let renderMethod = renderToHTML
      let inAmpMode = false,
        hybridAmp = false

      const renderedDuringBuild = (getStaticProps: any) => {
        return !buildExport && getStaticProps && !isDynamicRoute(path)
      }

      if (serverless) {
        const curUrl = url.parse(req.url!, true)
        req.url = url.format({
          ...curUrl,
          query: {
            ...curUrl.query,
            ...query,
          },
        })
        const {
          Component,
          ComponentMod,
          getServerSideProps,
          getStaticProps,
          pageConfig,
        } = await loadComponents(
          distDir,
          page,
          serverless,
          serverComponents,
          appDir
        )
        const ampState = {
          ampFirst: pageConfig?.amp === true,
          hasQuery: Boolean(query.amp),
          hybrid: pageConfig?.amp === 'hybrid',
        }
        inAmpMode = isInAmpMode(ampState)
        hybridAmp = ampState.hybrid

        if (getServerSideProps) {
          throw new Error(
            `Error for page ${page}: ${SERVER_PROPS_EXPORT_ERROR}`
          )
        }

        // if it was auto-exported the HTML is loaded here
        if (typeof Component === 'string') {
          renderResult = RenderResult.fromStatic(Component)
          queryWithAutoExportWarn()
        } else {
          // for non-dynamic SSG pages we should have already
          // prerendered the file
          if (renderedDuringBuild(getStaticProps))
            return { ...results, duration: Date.now() - start }

          if (getStaticProps && !htmlFilepath.endsWith('.html')) {
            // make sure it ends with .html if the name contains a dot
            htmlFilename += '.html'
            htmlFilepath += '.html'
          }

          renderMethod = (ComponentMod as ComponentModule).renderReqToHTML
          const result = await renderMethod(
            req,
            res,
            'export',
            {
              ampPath: renderAmpPath,
              /// @ts-ignore
              optimizeFonts,
              /// @ts-ignore
              optimizeCss,
              disableOptimizedLoading,
              distDir,
              fontManifest: optimizeFonts
                ? requireFontManifest(distDir, serverless)
                : null,
              locale: locale!,
              locales: renderOpts.locales!,
            },
            // @ts-ignore
            params
          )
          curRenderOpts = (result as any).renderOpts || {}
          renderResult = (result as any).html
        }

        if (!renderResult && !(curRenderOpts as any).isNotFound) {
          throw new Error(`Failed to render serverless page`)
        }
      } else {
        const components = await loadComponents(
          distDir,
          page,
          serverless,
          serverComponents
        )
        const ampState = {
          ampFirst: components.pageConfig?.amp === true,
          hasQuery: Boolean(query.amp),
          hybrid: components.pageConfig?.amp === 'hybrid',
        }
        inAmpMode = isInAmpMode(ampState)
        hybridAmp = ampState.hybrid

        if (components.getServerSideProps) {
          throw new Error(
            `Error for page ${page}: ${SERVER_PROPS_EXPORT_ERROR}`
          )
        }

        // for non-dynamic SSG pages we should have already
        // prerendered the file
        if (renderedDuringBuild(components.getStaticProps)) {
          return { ...results, duration: Date.now() - start }
        }

        // TODO: de-dupe the logic here between serverless and server mode
        if (components.getStaticProps && !htmlFilepath.endsWith('.html')) {
          // make sure it ends with .html if the name contains a dot
          htmlFilepath += '.html'
          htmlFilename += '.html'
        }

        if (typeof components.Component === 'string') {
          renderResult = RenderResult.fromStatic(components.Component)
          queryWithAutoExportWarn()
        } else {
          /**
           * This sets environment variable to be used at the time of static export by head.tsx.
           * Using this from process.env allows targeting both serverless and SSR by calling
           * `process.env.__NEXT_OPTIMIZE_FONTS`.
           * TODO(prateekbh@): Remove this when experimental.optimizeFonts are being cleaned up.
           */
          if (optimizeFonts) {
            process.env.__NEXT_OPTIMIZE_FONTS = JSON.stringify(true)
          }
          if (optimizeCss) {
            process.env.__NEXT_OPTIMIZE_CSS = JSON.stringify(true)
          }
          curRenderOpts = {
            ...components,
            ...renderOpts,
            ampPath: renderAmpPath,
            params,
            optimizeFonts,
            optimizeCss,
            disableOptimizedLoading,
            fontManifest: optimizeFonts
              ? requireFontManifest(distDir, serverless)
              : null,
            locale: locale as string,
          }
          renderResult = await renderMethod(
            req,
            res,
            page,
            query,
            // @ts-ignore
            curRenderOpts
          )
        }
      }
      results.ssgNotFound = (curRenderOpts as any).isNotFound

      const validateAmp = async (
        rawAmpHtml: string,
        ampPageName: string,
        validatorPath?: string
      ) => {
        const validator = await AmpHtmlValidator.getInstance(validatorPath)
        const result = validator.validateString(rawAmpHtml)
        const errors = result.errors.filter((e) => e.severity === 'ERROR')
        const warnings = result.errors.filter((e) => e.severity !== 'ERROR')

        if (warnings.length || errors.length) {
          results.ampValidations.push({
            page: ampPageName,
            result: {
              errors,
              warnings,
            },
          })
        }
      }

      const html = renderResult ? renderResult.toUnchunkedString() : ''
      if (inAmpMode && !curRenderOpts.ampSkipValidation) {
        if (!results.ssgNotFound) {
          await validateAmp(html, path, curRenderOpts.ampValidatorPath)
        }
      } else if (hybridAmp) {
        // we need to render the AMP version
        let ampHtmlFilename = `${ampPath}${sep}index.html`
        if (!subFolders) {
          ampHtmlFilename = `${ampPath}.html`
        }
        const ampBaseDir = join(outDir, dirname(ampHtmlFilename))
        const ampHtmlFilepath = join(outDir, ampHtmlFilename)

        try {
          await promises.access(ampHtmlFilepath)
        } catch (_) {
          // make sure it doesn't exist from manual mapping
          let ampRenderResult
          if (serverless) {
            req.url += (req.url!.includes('?') ? '&' : '?') + 'amp=1'
            // @ts-ignore
            ampRenderResult = (
              await (renderMethod as any)(
                req,
                res,
                'export',
                curRenderOpts,
                params
              )
            ).html
          } else {
            ampRenderResult = await renderMethod(
              req,
              res,
              page,
              // @ts-ignore
              { ...query, amp: '1' },
              curRenderOpts as any
            )
          }

          const ampHtml = ampRenderResult
            ? ampRenderResult.toUnchunkedString()
            : ''
          if (!curRenderOpts.ampSkipValidation) {
            await validateAmp(ampHtml, page + '?amp=1')
          }
          await promises.mkdir(ampBaseDir, { recursive: true })
          await promises.writeFile(ampHtmlFilepath, ampHtml, 'utf8')
        }
      }

      if ((curRenderOpts as any).pageData) {
        const dataFile = join(
          pagesDataDir,
          htmlFilename.replace(/\.html$/, '.json')
        )

        await promises.mkdir(dirname(dataFile), { recursive: true })
        await promises.writeFile(
          dataFile,
          JSON.stringify((curRenderOpts as any).pageData),
          'utf8'
        )

        if (hybridAmp) {
          await promises.writeFile(
            dataFile.replace(/\.json$/, '.amp.json'),
            JSON.stringify((curRenderOpts as any).pageData),
            'utf8'
          )
        }
      }
      results.fromBuildExportRevalidate = (curRenderOpts as any).revalidate

      if (!results.ssgNotFound) {
        // don't attempt writing to disk if getStaticProps returned not found
        await promises.writeFile(htmlFilepath, html, 'utf8')
      }
    } catch (error) {
      console.error(
        `\nError occurred prerendering page "${path}". Read more: https://nextjs.org/docs/messages/prerender-error\n` +
          (isError(error) && error.stack ? error.stack : error)
      )
      results.error = true
    }
    return { ...results, duration: Date.now() - start }
  })
}
