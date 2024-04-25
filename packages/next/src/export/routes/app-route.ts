import type { ExportRouteResult, FileWriter } from '../types'
import type AppRouteRouteModule from '../../server/future/route-modules/app-route/module'
import type { AppRouteRouteHandlerContext } from '../../server/future/route-modules/app-route/module'
import type { IncrementalCache } from '../../server/lib/incremental-cache'

import { join } from 'path'
import {
  NEXT_BODY_SUFFIX,
  NEXT_CACHE_TAGS_HEADER,
  NEXT_META_SUFFIX,
} from '../../lib/constants'
import { NodeNextRequest } from '../../server/base-http/node'
import { RouteModuleLoader } from '../../server/future/helpers/module-loader/route-module-loader'
import {
  NextRequestAdapter,
  signalFromNodeResponse,
} from '../../server/web/spec-extension/adapters/next-request'
import { toNodeOutgoingHttpHeaders } from '../../server/web/utils'
import type {
  MockedRequest,
  MockedResponse,
} from '../../server/lib/mock-request'
import { isDynamicUsageError } from '../helpers/is-dynamic-usage-error'
import { SERVER_DIRECTORY } from '../../shared/lib/constants'
import { hasNextSupport } from '../../telemetry/ci-info'
import type { ExperimentalConfig } from '../../server/config-shared'

export const enum ExportedAppRouteFiles {
  BODY = 'BODY',
  META = 'META',
}

export async function exportAppRoute(
  req: MockedRequest,
  res: MockedResponse,
  params: { [key: string]: string | string[] } | undefined,
  page: string,
  incrementalCache: IncrementalCache | undefined,
  distDir: string,
  htmlFilepath: string,
  fileWriter: FileWriter,
  experimental: Required<Pick<ExperimentalConfig, 'after'>>
): Promise<ExportRouteResult> {
  // Ensure that the URL is absolute.
  req.url = `http://localhost:3000${req.url}`

  // Adapt the request and response to the Next.js request and response.
  const request = NextRequestAdapter.fromNodeNextRequest(
    new NodeNextRequest(req),
    signalFromNodeResponse(res)
  )

  // Create the context for the handler. This contains the params from
  // the route and the context for the request.
  const context: AppRouteRouteHandlerContext = {
    params,
    prerenderManifest: {
      version: 4,
      routes: {},
      dynamicRoutes: {},
      preview: {
        previewModeEncryptionKey: '',
        previewModeId: '',
        previewModeSigningKey: '',
      },
      notFoundRoutes: [],
    },
    renderOpts: {
      experimental: experimental,
      originalPathname: page,
      nextExport: true,
      supportsDynamicHTML: false,
      incrementalCache,
      // @ts-expect-error TODO(after): fix the typing here
      waitUntil: function noWaitUntilInPrerender() {
        throw new Error('waitUntil cannot be called during prerendering.')
      },
    },
  }

  if (hasNextSupport) {
    context.renderOpts.isRevalidate = true
  }

  // This is a route handler, which means it has it's handler in the
  // bundled file already, we should just use that.
  const filename = join(distDir, SERVER_DIRECTORY, 'app', page)

  try {
    // Route module loading and handling.
    const module = await RouteModuleLoader.load<AppRouteRouteModule>(filename)
    const response = await module.handle(request, context)

    const isValidStatus = response.status < 400 || response.status === 404
    if (!isValidStatus) {
      return { revalidate: 0 }
    }

    const blob = await response.blob()
    const revalidate =
      typeof context.renderOpts.store?.revalidate === 'undefined'
        ? false
        : context.renderOpts.store.revalidate

    const headers = toNodeOutgoingHttpHeaders(response.headers)
    const cacheTags = (context.renderOpts as any).fetchTags

    if (cacheTags) {
      headers[NEXT_CACHE_TAGS_HEADER] = cacheTags
    }

    if (!headers['content-type'] && blob.type) {
      headers['content-type'] = blob.type
    }

    // Writing response body to a file.
    const body = Buffer.from(await blob.arrayBuffer())
    await fileWriter(
      ExportedAppRouteFiles.BODY,
      htmlFilepath.replace(/\.html$/, NEXT_BODY_SUFFIX),
      body,
      'utf8'
    )

    // Write the request metadata to a file.
    const meta = { status: response.status, headers }
    await fileWriter(
      ExportedAppRouteFiles.META,
      htmlFilepath.replace(/\.html$/, NEXT_META_SUFFIX),
      JSON.stringify(meta)
    )

    return {
      revalidate: revalidate,
      metadata: meta,
    }
  } catch (err) {
    if (!isDynamicUsageError(err)) {
      throw err
    }

    return { revalidate: 0 }
  }
}
