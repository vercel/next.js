import type { ExportRouteResult } from '../types'
import type AppRouteRouteModule from '../../server/route-modules/app-route/module'
import type { AppRouteRouteHandlerContext } from '../../server/route-modules/app-route/module'
import type { IncrementalCache } from '../../server/lib/incremental-cache'

import {
  INFINITE_CACHE,
  NEXT_BODY_SUFFIX,
  NEXT_CACHE_TAGS_HEADER,
  NEXT_META_SUFFIX,
} from '../../lib/constants'
import { NodeNextRequest } from '../../server/base-http/node'
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
import { isStaticGenEnabled } from '../../server/route-modules/app-route/helpers/is-static-gen-enabled'
import type { ExperimentalConfig } from '../../server/config-shared'
import { isMetadataRoute } from '../../lib/metadata/is-metadata-route'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import type { Params } from '../../server/request/params'
import { AfterRunner } from '../../server/after/run-with-after'
import type { MultiFileWriter } from '../../lib/multi-file-writer'

export const enum ExportedAppRouteFiles {
  BODY = 'BODY',
  META = 'META',
}

export async function exportAppRoute(
  req: MockedRequest,
  res: MockedResponse,
  params: Params | undefined,
  page: string,
  module: AppRouteRouteModule,
  incrementalCache: IncrementalCache | undefined,
  cacheLifeProfiles:
    | undefined
    | {
        [profile: string]: import('../../server/use-cache/cache-life').CacheLife
      },
  htmlFilepath: string,
  fileWriter: MultiFileWriter,
  cacheComponents: boolean,
  experimental: Required<Pick<ExperimentalConfig, 'authInterrupts'>>,
  buildId: string
): Promise<ExportRouteResult> {
  // Ensure that the URL is absolute.
  req.url = `http://localhost:3000${req.url}`

  // Adapt the request and response to the Next.js request and response.
  const request = NextRequestAdapter.fromNodeNextRequest(
    new NodeNextRequest(req),
    signalFromNodeResponse(res)
  )

  const afterRunner = new AfterRunner()

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
      cacheComponents,
      experimental,
      nextExport: true,
      supportsDynamicResponse: false,
      incrementalCache,
      waitUntil: afterRunner.context.waitUntil,
      onClose: afterRunner.context.onClose,
      onAfterTaskError: afterRunner.context.onTaskError,
      cacheLifeProfiles,
    },
    sharedContext: {
      buildId,
    },
  }

  try {
    const userland = module.userland
    // we don't bail from the static optimization for
    // metadata routes, since it's app-route we can always append /route suffix.
    const routePath = normalizeAppPath(page) + '/route'
    const isPageMetadataRoute = isMetadataRoute(routePath)

    if (
      !isStaticGenEnabled(userland) &&
      !isPageMetadataRoute &&
      // We don't disable static gen when cacheComponents is enabled because we
      // expect that anything dynamic in the GET handler will make it dynamic
      // and thus avoid the cache surprises that led to us removing static gen
      // unless specifically opted into
      cacheComponents !== true
    ) {
      return { cacheControl: { revalidate: 0, expire: undefined } }
    }

    const response = await module.handle(request, context)

    const isValidStatus = response.status < 400 || response.status === 404
    if (!isValidStatus) {
      return { cacheControl: { revalidate: 0, expire: undefined } }
    }

    const blob = await response.blob()

    // TODO(after): if we abort a prerender because of an error in an after-callback
    // we should probably communicate that better (and not log the error twice)
    await afterRunner.executeAfter()

    const revalidate =
      typeof context.renderOpts.collectedRevalidate === 'undefined' ||
      context.renderOpts.collectedRevalidate >= INFINITE_CACHE
        ? false
        : context.renderOpts.collectedRevalidate

    const expire =
      typeof context.renderOpts.collectedExpire === 'undefined' ||
      context.renderOpts.collectedExpire >= INFINITE_CACHE
        ? undefined
        : context.renderOpts.collectedExpire

    const headers = toNodeOutgoingHttpHeaders(response.headers)
    const cacheTags = context.renderOpts.collectedTags

    if (cacheTags) {
      headers[NEXT_CACHE_TAGS_HEADER] = cacheTags
    }

    if (!headers['content-type'] && blob.type) {
      headers['content-type'] = blob.type
    }

    // Writing response body to a file.
    const body = Buffer.from(await blob.arrayBuffer())
    fileWriter.append(htmlFilepath.replace(/\.html$/, NEXT_BODY_SUFFIX), body)

    // Write the request metadata to a file.
    const meta = { status: response.status, headers }
    fileWriter.append(
      htmlFilepath.replace(/\.html$/, NEXT_META_SUFFIX),
      JSON.stringify(meta)
    )

    return {
      cacheControl: { revalidate, expire },
      metadata: meta,
    }
  } catch (err) {
    if (!isDynamicUsageError(err)) {
      throw err
    }

    return { cacheControl: { revalidate: 0, expire: undefined } }
  }
}
