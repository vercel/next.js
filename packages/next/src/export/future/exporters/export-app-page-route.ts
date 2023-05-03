import type { BatchedFileWriter } from '../../helpers/batched-file-writer'
import type { ExportersResult } from './exporters'
import type { NextParsedUrlQuery } from '../../../server/request-meta'
import type {
  RenderOpts,
  RenderOptsPartial,
} from '../../../server/app-render/types'

import { createRequestResponseMocks } from '../../../server/lib/mock-request'
import { isDynamicUsageError } from '../helpers/is-dynamic-usage-error'
import { loadComponents } from '../../../server/load-components'
import { isDynamicRoute } from '../../../shared/lib/router/utils'
import { getParams } from '../helpers/get-params'
import { getHTMLFilename } from './helpers/get-html-filename'
import { posix } from 'path'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { IncrementalCache } from '../../../server/lib/incremental-cache'
import RenderResult from '../../../server/render-result'
import { OutgoingHttpHeaders } from 'http'
import { normalizeAppPath } from '../../../shared/lib/router/utils/app-paths'
import * as ciEnvironment from '../../../telemetry/ci-info'

type ExportAppPageRouteContext = {
  page: string
  pathname: string
  renderOpts: RenderOptsPartial
  query: NextParsedUrlQuery
  writer: BatchedFileWriter
  outDir: string
  distDir: string
  isDynamicError: any
  debugOutput: boolean | undefined
  serverComponents: boolean
  subFolders: boolean
  incrementalCache: IncrementalCache | undefined
}

export async function exportAppPageRoute({
  renderOpts,
  page,
  pathname,
  query,
  distDir,
  outDir,
  writer,
  serverComponents,
  isDynamicError,
  debugOutput,
  subFolders,
}: ExportAppPageRouteContext): Promise<ExportersResult | null> {
  const isDynamic = isDynamicRoute(page)

  // We need to show a warning if they try to provide query values
  // for an auto-exported page since they won't be available
  const hasOrigQueryValues = Object.keys(query).length > 0

  // The basename of the page that we're currently rendering. This should end
  // with an `.html` extension.
  let htmlBasename: string
  if (pathname === '/404.html') {
    htmlBasename = pathname
  } else if (pathname === '/') {
    htmlBasename = 'index.html'
  } else {
    // TODO: (wyattjoh) this is from the legacy implementation and should be fixed
    htmlBasename = getHTMLFilename(normalizePagePath(pathname), { subFolders })
  }

  // The path to the HTML file that we're going to render.
  const htmlFilepath = posix.join(outDir, htmlBasename)

  // If the route is dynamic, get the params from the path.
  const params =
    // If the page is a dynamic route and the request path is not the same as
    // the page, then get the parameters.
    isDynamic && page !== pathname
      ? getParams(normalizeAppPath(page), pathname)
      : {}

  const components = await loadComponents({
    distDir,
    pathname: page,
    hasServerComponents: !!serverComponents,
    isAppPath: true,
  })

  // Lazily load the renderer.
  const { renderToHTMLOrFlight } =
    require('../../../server/app-render/app-render') as typeof import('../../../server/app-render/app-render')

  const { req, res } = createRequestResponseMocks({
    url: `http://localhost:3000${pathname}`,
  })

  const context: RenderOpts = {
    ...components,
    ...renderOpts,
    // @ts-expect-error - this is temporary until we update the types
    params,
    supportsDynamicHTML: false,
  }

  let result: RenderResult
  try {
    if (typeof components.Component === 'string') {
      if (hasOrigQueryValues) {
        throw new Error(
          `\nError: you provided query values for ${pathname} which is an auto-exported page. These can not be applied since the page can no longer be re-rendered on the server. To disable auto-export for this page add \`getInitialProps\`\n`
        )
      }

      result = RenderResult.fromStatic(components.Component)
    } else {
      // Render the page.
      result = await renderToHTMLOrFlight(
        req,
        res,
        page === '/_not-found' ? '/404' : pathname,
        query,
        context
      )
    }
  } catch (err) {
    if (isDynamicUsageError(err)) {
      return { type: 'dynamic' }
    }

    return { type: 'error', error: err }
  }

  const html = result.toUnchunkedString()
  const metadata = result.metadata()

  // This is the `export const dynamic = 'error'` case, this should be
  // improved with the app page route module adoption.
  if (isDynamicError) {
    throw new Error(
      `Page with dynamic = "error" encountered dynamic data method on ${pathname}.`
    )
  }

  if (metadata.revalidate !== 0) {
    writer.write(htmlFilepath, html, 'utf8')
    writer.write(htmlFilepath.replace(/\.html$/, '.rsc'), metadata.pageData)
  }

  let headers: OutgoingHttpHeaders | undefined
  if (ciEnvironment.hasNextSupport) {
    const cacheTags = (context as any).fetchTags
    if (cacheTags) {
      headers = {
        'x-next-cache-tags': cacheTags,
      }
    }
  }

  // Warn about static generation failures when debug is enabled.
  if (
    debugOutput &&
    metadata.revalidate === 0 &&
    metadata.staticBailoutInfo?.description
  ) {
    const err = new Error(
      `Static generation failed due to dynamic usage on ${pathname}, reason: ${metadata.staticBailoutInfo.description}`
    )
    const stack = metadata.staticBailoutInfo.stack

    if (stack) {
      err.stack = err.message + stack.substring(stack.indexOf('\n'))
    }

    console.warn(err)
  }

  return {
    type: 'built',
    revalidate: metadata.revalidate,
    metadata: {
      status: undefined,
      headers,
    },
  }
}
