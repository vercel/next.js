import type PagesRouteModule from '../../../server/future/route-modules/pages/module'
import type { PagesRouteHandlerContext } from '../../../server/future/route-modules/pages/module'
import type { ExportersResult } from './exporters'
import type { BatchedFileWriter } from '../../helpers/batched-file-writer'

import { posix } from 'path'
import { PAGES_MANIFEST } from '../../../shared/lib/constants'
import { RenderOpts } from '../../worker'
import { ManifestLoader } from '../../../server/future/route-modules/pages/helpers/load-manifests'
import {
  NextParsedUrlQuery,
  addRequestMeta,
} from '../../../server/request-meta'
import { normalizeLocalePath } from '../../../shared/lib/i18n/normalize-locale-path'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { isDynamicRoute } from '../../../shared/lib/router/utils'
import { getParams } from '../helpers/get-params'
import { NodeNextRequest } from '../../../server/base-http/node'
import { MockedRequest, MockedResponse } from '../../../server/lib/mock-request'
import { NextRequestAdapter } from '../../../server/web/spec-extension/adapters/next-request'
import { getStatusCode } from '../helpers/get-status-code'
import { getHTMLFilename } from './helpers/get-html-filename'
import { ManifestRouteModuleLoader } from '../../../server/future/helpers/module-loader/manifest-module-loader'
import { stripInternalQueries } from '../../../server/internal-utils'
import { type ValidationErrors, validateAmp } from './helpers/validate-amp'

type ExportPagesRouteRenderOpts = Pick<
  RenderOpts,
  | 'runtimeConfig'
  | 'locales'
  | 'defaultLocale'
  | 'locale'
  | 'domainLocales'
  | 'trailingSlash'
>

type ExportPagesRouteContext = {
  page: string
  pathname: string
  query: NextParsedUrlQuery
  distDir: string
  subFolders: boolean
  outDir: string
  pagesDataDir: string
  buildExport: boolean
  renderOpts: ExportPagesRouteRenderOpts
  writer: BatchedFileWriter
}

export async function exportPagesRoute({
  page,
  pathname,
  query,
  distDir,
  outDir,
  pagesDataDir,
  buildExport,
  renderOpts,
  writer,
  subFolders,
}: ExportPagesRouteContext): Promise<ExportersResult | null> {
  // Create the manifest route module loader.
  const manifestLoader = new ManifestRouteModuleLoader(distDir, PAGES_MANIFEST)

  const isDynamic = isDynamicRoute(page)
  const isBuiltIn = /^\/(400|500)(.html)?$/.test(pathname)
  const normalizedPathname = normalizePagePath(pathname)

  // We need to show a warning if they try to provide query values
  // for an auto-exported page since they won't be available
  const hasOrigQueryValues = Object.keys(query).length > 0

  /**
   * Represents the internal pathname used for routing.
   */
  let updatedPath = query.__nextSsgPath || pathname
  delete query.__nextSsgPath

  // The basename of the page that we're currently rendering. This should end
  // with an `.html` extension.
  let htmlBasename = getHTMLFilename(normalizedPathname, { subFolders })

  const extensions = {
    page: posix.extname(page),
    pathname: posix.extname(pathname),
  }

  // Ensure that 404 pages are always named 404.html
  if (pathname === '/404.html') {
    htmlBasename = pathname
  }
  // Ensure that root level index files are always named index.html
  else if (pathname === '/') {
    htmlBasename = 'index.html'
  }
  // If the page is not dynamic and the extensions on the pathname and page
  // don't match, we should use the pathname without normalization with the
  // `.html` extension.
  else if (
    !isDynamic &&
    extensions.page !== extensions.pathname &&
    extensions.pathname !== ''
  ) {
    htmlBasename =
      !isBuiltIn && extensions.pathname === '.html'
        ? getHTMLFilename(pathname, { subFolders })
        : pathname
  }

  // The path to the HTML file that we're going to render.
  const htmlFilepath = posix.join(outDir, htmlBasename)

  // Try to load the module.
  const module = await manifestLoader.load<PagesRouteModule>(page)
  if (typeof module === 'string') {
    if (hasOrigQueryValues) {
      throw new Error(
        `\nError: you provided query values for ${pathname} which is an auto-exported page. These can not be applied since the page can no longer be re-rendered on the server. To disable auto-export for this page add \`getInitialProps\`\n`
      )
    }

    // Write the HTML file to disk.
    writer.write(htmlFilepath, module, 'utf8')

    // Return that we've already built this page.
    return {
      type: 'built',
      revalidate: undefined,
      amp: undefined,
      metadata: undefined,
    }
  }

  // For AMP support, we need to render the AMP version of the page.
  const ampPath = `${normalizedPathname}.amp`

  // The path that users navigate to when they want to get to that page. Later
  // this may remove the locale prefix if the locale is the default locale.
  let renderAmpPath = ampPath

  // Default the locale.
  let locale = query.__nextLocale || renderOpts.locale
  delete query.__nextLocale

  // If a locale has been indicated on the request, then try to normalize the
  // path to remove the locale part.
  if (renderOpts.locale) {
    const result = normalizeLocalePath(pathname, renderOpts.locales)
    if (result.detectedLocale) {
      // Update the pathname to exclude the locale and save the detected locale.
      updatedPath = result.pathname
      locale = result.detectedLocale

      // If the detected locale is the same as the default locale, we should use
      // the stripped path as the AMP path.
      if (locale === renderOpts.defaultLocale) {
        renderAmpPath = `${normalizePagePath(updatedPath)}.amp`
      }
    }
  }

  // Create the mocked request. This looks really bad, but these wrappers will
  // convert the MockedRequest to a NodeNextRequest to a NextRequest.
  const req = new MockedRequest({
    method: 'GET',
    url: `https://localhost:3000${updatedPath}`,
    headers: {},
  })

  // Add the trailing slash if it's missing and required.
  if (renderOpts.trailingSlash && !updatedPath.endsWith('/')) {
    req.url += '/'
  }

  // Create the mocked response.
  const res = new MockedResponse()

  // Try to get the status code from the pathname. If the pathname has a locale
  // and we can't find a direct match with the updated path, then try to see if
  // this is a match for the locale, otherwise, default to 200.
  const statusCode =
    getStatusCode(updatedPath) ??
    (locale ? getStatusCode(`/${locale}${updatedPath}`) ?? 200 : 200)
  res.statusCode = statusCode

  const isLocaleDomain: boolean =
    buildExport &&
    Boolean(locale) &&
    Array.isArray(renderOpts.domainLocales) &&
    renderOpts.domainLocales.some(
      (dl) => dl.defaultLocale === locale || dl.locales?.includes(locale || '')
    )
  if (isLocaleDomain) {
    addRequestMeta(req, '__nextIsLocaleDomain', true)
  }

  const request = NextRequestAdapter.fromNodeNextRequest(
    new NodeNextRequest(req)
  )

  // If the route is dynamic, get the params from the path.
  const params =
    // If the page is a dynamic route and the request path is not the same as
    // the page, then get the parameters.
    isDynamic && page !== updatedPath ? getParams(page, updatedPath) : false
  if (params) {
    // Merge the params into the query.
    query = { ...query, ...params }
  }

  const context: PagesRouteHandlerContext = {
    params: query,
    export: true,
    manifests: ManifestLoader.load({ distDir }),
    headers: undefined,
    previewProps: undefined,
    renderOpts: {
      req,
      res,
      statusCode,
      query,
      ampPath: renderAmpPath,
      customServer: undefined,
      distDir,
      isDataReq: false,
      err: undefined,
      locale,
      defaultLocale: renderOpts.defaultLocale,
      isLocaleDomain,
    },
  }

  // Validate the module. If it doesn't error here, then it _could_ be
  // pre-rendered.
  module.setup(true)

  // For non-dynamic routes that have getStaticProps we should have already
  // pre-rendered the page.
  if (!buildExport && module.userland.getStaticProps && !isDynamic) {
    return null
  }

  const { __nextFallback, __nextNotFoundSrcPage } = context.renderOpts.query
  stripInternalQueries(context.renderOpts.query)

  // Render the page using the module.
  let result = await module.render(request, {
    ...context,
    pathname: page,
    req,
    res,
    previewData: undefined,
    isPreviewMode: false,
    isFallback: __nextFallback === 'true',
    notFoundSrcPage: __nextNotFoundSrcPage,
  })

  let metadata = result.metadata()

  // If the status code isn't 200, we should bail out.
  if (metadata.isNotFound || metadata.isRedirect || !result.body) {
    return { type: 'not-found' }
  }

  // As we now have verified that the result of the module being executed
  // is not a redirect or a 404, we can now safely write the file to disk.
  let html = result.toUnchunkedString()

  // Write the HTML file to disk.
  writer.write(htmlFilepath, html, 'utf8')

  // Write the static props file to disk if it exists.
  if (metadata.pageData) {
    writer.write(
      posix.join(pagesDataDir, htmlBasename).replace(/\.html$/, '.json'),
      JSON.stringify(metadata.pageData)
    )
  }

  const amp: {
    validations: Array<{
      page: string
      result: ValidationErrors
    }>
  } = {
    validations: [],
  }

  // Check to see if we need to render an AMP version of the page.
  const isInAmpMode =
    module.amp === true || (module.amp === 'hybrid' && Boolean(query.amp))

  if (isInAmpMode && !module.config?.experimental.amp?.skipValidation) {
    if (!metadata.isNotFound) {
      const results = await validateAmp(
        html,
        module.config?.experimental.amp?.validator
      )
      if (results) {
        amp.validations.push({ page: pathname, result: results })
      }
    }
  } else if (module.amp === 'hybrid') {
    // Because we didn't render the amp page yet but it's being requested (the
    // page config indicates it's a hybrid page), we need to render the AMP
    // version of the page.
    const ampHtmlBasename = getHTMLFilename(ampPath, { subFolders })
    const ampHtmlFilepath = posix.join(outDir, ampHtmlBasename)

    // Render the AMP version of the page.
    result = await module.render(request, {
      ...context,
      renderOpts: {
        ...context.renderOpts,
        query: { ...query, amp: '1' },
      },
      pathname: page,
      req,
      res,
      previewData: undefined,
      isPreviewMode: false,
      isFallback: __nextFallback === 'true',
      notFoundSrcPage: __nextNotFoundSrcPage,
    })

    html = result.toUnchunkedString()
    metadata = result.metadata()

    // Write the AMP HTML file to disk.
    if (!metadata.isNotFound) {
      if (!module.config?.experimental.amp?.skipValidation) {
        const results = await validateAmp(
          html,
          module.config?.experimental.amp?.validator
        )
        if (results) {
          amp.validations.push({ page: pathname + '?amp=1', result: results })
        }
      }

      writer.write(ampHtmlFilepath, html, 'utf8')
    }

    // Write the static props file to disk if it exists.
    if (metadata.pageData) {
      writer.write(
        posix
          .join(pagesDataDir, ampHtmlBasename)
          .replace(/\.html$/, '.amp.json'),
        JSON.stringify(metadata.pageData)
      )
    }
  }

  return {
    type: 'built',
    revalidate: metadata.revalidate,
    amp,
    metadata: undefined,
  }
}
