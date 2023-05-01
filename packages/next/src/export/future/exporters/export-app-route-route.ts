import type AppRouteRouteModule from '../../../server/future/route-modules/app-route/module'
import type { ExportersResult } from './exporters'
import type { BatchedFileWriter } from '../../helpers/batched-file-writer'
import type { IncrementalCache } from '../../../server/lib/incremental-cache'

import { posix } from 'path'
import { RouteModuleLoader } from '../../../server/future/helpers/module-loader/route-module-loader'
import { toNodeHeaders } from '../../../server/web/utils'
import { isDynamicUsageError } from '../helpers/is-dynamic-usage-error'
import { AppRouteRouteHandlerContext } from '../../../server/future/route-modules/app-route/module'
import { isDynamicRoute } from '../../../shared/lib/router/utils/is-dynamic'
import { getParams } from '../helpers/get-params'
import { NextRequestAdapter } from '../../../server/web/spec-extension/adapters/next-request'
import { NodeNextRequest } from '../../../server/base-http/node'
import { MockedRequest } from '../../../server/lib/mock-request'
import { normalizePagePath } from '../../../shared/lib/page-path/normalize-page-path'
import { getHTMLFilename } from './helpers/get-html-filename'

type ExportAppRouteRouteContext = {
  page: string
  pathname: string
  outDir: string
  distDir: string
  writer: BatchedFileWriter
  subFolders: boolean
  incrementalCache: IncrementalCache | undefined
}

export async function exportAppRouteRoute({
  page,
  pathname,
  distDir,
  outDir,
  writer,
  subFolders,
  incrementalCache,
}: ExportAppRouteRouteContext): Promise<ExportersResult | null> {
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

  // If the rout is dynamic, get the params from the path.
  const params = isDynamicRoute(page) ? getParams(page, pathname) : {}

  // Create the context for the handler. This contains the params from
  // the route and the context for the request.
  const context: AppRouteRouteHandlerContext = {
    params,
    export: true,
    previewProps: undefined,
    headers: undefined,
    staticGenerationContext: {
      supportsDynamicHTML: false,
      incrementalCache,
    },
  }

  // Create the mocked request. This looks really bad, but these wrappers will
  // convert the MockedRequest to a NodeNextRequest to a NextRequest.
  const request = NextRequestAdapter.fromNodeNextRequest(
    new NodeNextRequest(
      new MockedRequest({
        method: 'GET',
        url: `https://localhost:3000${pathname}`,
        headers: {},
      })
    )
  )

  try {
    const filename = posix.join(distDir, 'server', 'app', page)

    // Load the module for the route.
    const module = RouteModuleLoader.load<AppRouteRouteModule>(filename)

    // Call the handler with the request and context from the module.
    const response = await module.handle(request, context)

    // TODO: (wyattjoh) if cookie headers are present, should we bail?
    // we don't consider error status for static generation
    // except for 404

    // If the status code is greater than 400 (excluding 404), we should bail
    // out and not export the page.
    if (response.status >= 400 && response.status !== 404) {
      return null
    }

    // Get the response as a blob, we're going to write it to disk.
    const body = await response.blob()

    // Default to the blob's type if the response doesn't have a content-type.
    const headers = toNodeHeaders(response.headers)
    if (!headers['content-type'] && body.type) {
      headers['content-type'] = body.type
    }

    writer.write(
      htmlFilepath.replace(/\.html$/, '.body'),
      Buffer.from(await body.arrayBuffer())
    )
    writer.write(
      htmlFilepath.replace(/\.html$/, '.meta'),
      JSON.stringify({ status: response.status, headers })
    )

    return {
      type: 'built',
      revalidate: context.staticGenerationContext.store?.revalidate || false,
      metadata: { status: response.status, headers },
    }
  } catch (err) {
    if (!isDynamicUsageError(err)) {
      return { type: 'error', error: err }
    }

    return null
  }
}
