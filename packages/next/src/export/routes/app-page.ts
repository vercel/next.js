import type { OutgoingHttpHeaders } from 'node:http'
import type { ExportRouteResult } from '../types'
import type { RenderOpts } from '../../server/app-render/types'
import type { NextParsedUrlQuery } from '../../server/request-meta'
import type { RouteMetadata } from './types'

import type {
  MockedRequest,
  MockedResponse,
} from '../../server/lib/mock-request'
import { isDynamicUsageError } from '../helpers/is-dynamic-usage-error'
import {
  NEXT_CACHE_TAGS_HEADER,
  NEXT_META_SUFFIX,
  RSC_PREFETCH_SUFFIX,
  RSC_SUFFIX,
  RSC_SEGMENTS_DIR_SUFFIX,
  RSC_SEGMENT_SUFFIX,
} from '../../lib/constants'
import { hasNextSupport } from '../../server/ci-info'
import { lazyRenderAppPage } from '../../server/route-modules/app-page/module.render'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'
import { NodeNextRequest, NodeNextResponse } from '../../server/base-http/node'
import { NEXT_IS_PRERENDER_HEADER } from '../../client/components/app-router-headers'
import type { FetchMetrics } from '../../server/base-http'
import type { WorkStore } from '../../server/app-render/work-async-storage.external'
import type { OpaqueFallbackRouteParams } from '../../server/request/fallback-params'
import { AfterRunner } from '../../server/after/run-with-after'
import type { RequestLifecycleOpts } from '../../server/base-server'
import type { AppSharedContext } from '../../server/app-render/app-render'
import type { MultiFileWriter } from '../../lib/multi-file-writer'
import { stringifyResumeDataCache } from '../../server/resume-data-cache/resume-data-cache'
import {
  UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY,
  UNDERSCORE_NOT_FOUND_ROUTE_ENTRY,
} from '../../shared/lib/entry-constants'

/**
 * Renders & exports a page associated with the /app directory
 */
export async function exportAppPage(
  req: MockedRequest,
  res: MockedResponse,
  page: string,
  path: string,
  pathname: string,
  query: NextParsedUrlQuery,
  fallbackRouteParams: OpaqueFallbackRouteParams | null,
  partialRenderOpts: Omit<RenderOpts, keyof RequestLifecycleOpts>,
  htmlFilepath: string,
  debugOutput: boolean,
  isDynamicError: boolean,
  fileWriter: MultiFileWriter,
  sharedContext: AppSharedContext
): Promise<ExportRouteResult> {
  const afterRunner = new AfterRunner()

  const renderOpts: RenderOpts = {
    ...partialRenderOpts,
    waitUntil: afterRunner.context.waitUntil,
    onClose: afterRunner.context.onClose,
    onAfterTaskError: afterRunner.context.onTaskError,
  }

  let isDefaultNotFound = false
  let isDefaultGlobalError = false
  // If the page is `/_not-found`, then we should update the page to be `/404`.
  if (page === UNDERSCORE_NOT_FOUND_ROUTE_ENTRY) {
    isDefaultNotFound = true
    pathname = '/404'
  }
  // If the page is `/_global-error`, then we should update the page to be `/500`.
  if (page === UNDERSCORE_GLOBAL_ERROR_ROUTE_ENTRY) {
    isDefaultGlobalError = true
    pathname = '/500'
  }

  try {
    const result = await lazyRenderAppPage(
      new NodeNextRequest(req),
      new NodeNextResponse(res),
      pathname,
      query,
      fallbackRouteParams,
      renderOpts,
      undefined,
      sharedContext
    )

    const html = result.toUnchunkedString()

    // TODO(after): if we abort a prerender because of an error in an after-callback
    // we should probably communicate that better (and not log the error twice)
    await afterRunner.executeAfter()

    const { metadata } = result
    const {
      flightData,
      cacheControl = { revalidate: false, expire: undefined },
      postponed,
      fetchTags,
      fetchMetrics,
      segmentData,
      renderResumeDataCache,
    } = metadata

    // Ensure we don't postpone without having PPR enabled.
    if (postponed && !renderOpts.experimental.isRoutePPREnabled) {
      throw new Error('Invariant: page postponed without PPR being enabled')
    }

    if (cacheControl.revalidate === 0) {
      if (isDynamicError) {
        throw new Error(
          `Page with dynamic = "error" encountered dynamic data method on ${path}.`
        )
      }
      const { staticBailoutInfo = {} } = metadata

      if (debugOutput && staticBailoutInfo?.description) {
        logDynamicUsageWarning({
          path,
          description: staticBailoutInfo.description,
          stack: staticBailoutInfo.stack,
        })
      }

      return { cacheControl, fetchMetrics }
    }

    // If page data isn't available, it means that the page couldn't be rendered
    // properly so long as we don't have unknown route params. When a route doesn't
    // have unknown route params, there will not be any flight data.
    if (!flightData) {
      if (
        !fallbackRouteParams ||
        fallbackRouteParams.size === 0 ||
        renderOpts.cacheComponents
      ) {
        throw new Error(`Invariant: failed to get page data for ${path}`)
      }
    } else {
      // If PPR is enabled, we want to emit a prefetch rsc file for the page
      // instead of the standard rsc. This is because the standard rsc will
      // contain the dynamic data. We do this if any routes have PPR enabled so
      // that the cache read/write is the same.
      if (renderOpts.experimental.isRoutePPREnabled) {
        // If PPR is enabled, we should emit the flight data as the prefetch
        // payload.
        // TODO: This will eventually be replaced by the per-segment prefetch
        // output below.
        fileWriter.append(
          htmlFilepath.replace(/\.html$/, RSC_PREFETCH_SUFFIX),
          flightData
        )
      } else {
        // Writing the RSC payload to a file if we don't have PPR enabled.
        fileWriter.append(
          htmlFilepath.replace(/\.html$/, RSC_SUFFIX),
          flightData
        )
      }
    }

    let segmentPaths
    if (segmentData) {
      // Emit the per-segment prefetch data. We emit them as separate files
      // so that the cache handler has the option to treat each as a
      // separate entry.
      segmentPaths = []
      const segmentsDir = htmlFilepath.replace(
        /\.html$/,
        RSC_SEGMENTS_DIR_SUFFIX
      )

      for (const [segmentPath, buffer] of segmentData) {
        segmentPaths.push(segmentPath)
        const segmentDataFilePath =
          segmentsDir + segmentPath + RSC_SEGMENT_SUFFIX
        fileWriter.append(segmentDataFilePath, buffer)
      }
    }

    const headers: OutgoingHttpHeaders = { ...metadata.headers }

    // If we're writing the file to disk, we know it's a prerender.
    headers[NEXT_IS_PRERENDER_HEADER] = '1'

    if (fetchTags) {
      headers[NEXT_CACHE_TAGS_HEADER] = fetchTags
    }

    // Writing static HTML to a file.
    fileWriter.append(htmlFilepath, html)

    const isParallelRoute = /\/@\w+/.test(page)
    const isNonSuccessfulStatusCode = res.statusCode > 300

    // When PPR is enabled, we don't always send 200 for routes that have been
    // pregenerated, so we should grab the status code from the mocked
    // response.
    let status: number | undefined = renderOpts.experimental.isRoutePPREnabled
      ? res.statusCode
      : undefined

    if (isDefaultNotFound) {
      // Override the default /_not-found page status code to 404
      status = 404
    } else if (isDefaultGlobalError) {
      // Override the default /_global-error page status code to 500
      status = 500
    } else if (isNonSuccessfulStatusCode && !isParallelRoute) {
      // If it's parallel route the status from mock response is 404
      status = res.statusCode
    }

    // Writing the request metadata to a file.
    const meta: RouteMetadata = {
      status,
      headers,
      postponed,
      segmentPaths,
    }

    fileWriter.append(
      htmlFilepath.replace(/\.html$/, NEXT_META_SUFFIX),
      JSON.stringify(meta, null, 2)
    )

    return {
      // Filter the metadata if the environment does not have next support.
      metadata: hasNextSupport
        ? meta
        : {
            segmentPaths: meta.segmentPaths,
          },
      hasEmptyStaticShell: Boolean(postponed) && html === '',
      hasPostponed: Boolean(postponed),
      cacheControl,
      fetchMetrics,
      renderResumeDataCache: renderResumeDataCache
        ? await stringifyResumeDataCache(
            renderResumeDataCache,
            renderOpts.cacheComponents
          )
        : undefined,
    }
  } catch (err) {
    if (!isDynamicUsageError(err)) {
      throw err
    }

    // We should fail rendering if a client side rendering bailout
    // occurred at the page level.
    if (isBailoutToCSRError(err)) {
      throw err
    }

    let fetchMetrics: FetchMetrics | undefined

    if (debugOutput) {
      const store = (renderOpts as any).store as WorkStore
      const { dynamicUsageDescription, dynamicUsageStack } = store
      fetchMetrics = store.fetchMetrics

      logDynamicUsageWarning({
        path,
        description: dynamicUsageDescription ?? '',
        stack: dynamicUsageStack,
      })
    }

    return { cacheControl: { revalidate: 0, expire: undefined }, fetchMetrics }
  }
}

function logDynamicUsageWarning({
  path,
  description,
  stack,
}: {
  path: string
  description: string
  stack?: string
}) {
  const errMessage = new Error(
    `Static generation failed due to dynamic usage on ${path}, reason: ${description}`
  )

  if (stack) {
    errMessage.stack = errMessage.message + stack.substring(stack.indexOf('\n'))
  }

  console.warn(errMessage)
}
