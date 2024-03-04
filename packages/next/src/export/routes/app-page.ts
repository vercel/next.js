import type { OutgoingHttpHeaders } from 'node:http'
import type { ExportRouteResult, FileWriter } from '../types'
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
} from '../../lib/constants'
import { hasNextSupport } from '../../telemetry/ci-info'
import { lazyRenderAppPage } from '../../server/future/route-modules/app-page/module.render'
import { isBailoutToCSRError } from '../../shared/lib/lazy-dynamic/bailout-to-csr'

export const enum ExportedAppPageFiles {
  HTML = 'HTML',
  FLIGHT = 'FLIGHT',
  PREFETCH_FLIGHT = 'PREFETCH_FLIGHT',
  META = 'META',
  POSTPONED = 'POSTPONED',
}

export async function exportAppPage(
  req: MockedRequest,
  res: MockedResponse,
  page: string,
  path: string,
  pathname: string,
  query: NextParsedUrlQuery,
  renderOpts: RenderOpts,
  htmlFilepath: string,
  debugOutput: boolean,
  isDynamicError: boolean,
  fileWriter: FileWriter
): Promise<ExportRouteResult> {
  // If the page is `/_not-found`, then we should update the page to be `/404`.
  // UNDERSCORE_NOT_FOUND_ROUTE value used here, however we don't want to import it here as it causes constants to be inlined which we don't want here.
  if (page === '/_not-found') {
    pathname = '/404'
  }

  try {
    const result = await lazyRenderAppPage(
      req,
      res,
      pathname,
      query,
      renderOpts
    )

    const html = result.toUnchunkedString()

    const { metadata } = result
    const { flightData, revalidate = false, postponed, fetchTags } = metadata

    // Ensure we don't postpone without having PPR enabled.
    if (postponed && !renderOpts.experimental.ppr) {
      throw new Error('Invariant: page postponed without PPR being enabled')
    }

    if (revalidate === 0) {
      if (isDynamicError) {
        throw new Error(
          `Page with dynamic = "error" encountered dynamic data method on ${path}.`
        )
      }
      const { staticBailoutInfo = {} } = metadata

      if (revalidate === 0 && debugOutput && staticBailoutInfo?.description) {
        logDynamicUsageWarning({
          path,
          description: staticBailoutInfo.description,
          stack: staticBailoutInfo.stack,
        })
      }

      return { revalidate: 0 }
    }
    // If page data isn't available, it means that the page couldn't be rendered
    // properly.
    else if (!flightData) {
      throw new Error(`Invariant: failed to get page data for ${path}`)
    }
    // If PPR is enabled, we want to emit a prefetch rsc file for the page
    // instead of the standard rsc. This is because the standard rsc will
    // contain the dynamic data.
    else if (renderOpts.experimental.ppr) {
      // If PPR is enabled, we should emit the flight data as the prefetch
      // payload.
      await fileWriter(
        ExportedAppPageFiles.PREFETCH_FLIGHT,
        htmlFilepath.replace(/\.html$/, RSC_PREFETCH_SUFFIX),
        flightData
      )
    } else {
      // Writing the RSC payload to a file if we don't have PPR enabled.
      await fileWriter(
        ExportedAppPageFiles.FLIGHT,
        htmlFilepath.replace(/\.html$/, RSC_SUFFIX),
        flightData
      )
    }

    const headers: OutgoingHttpHeaders = { ...metadata.headers }

    // When PPR is enabled, we should grab the headers from the mocked response
    // and add it to the headers.
    if (renderOpts.experimental.ppr) {
      Object.assign(headers, res.getHeaders())
    }

    if (fetchTags) {
      headers[NEXT_CACHE_TAGS_HEADER] = fetchTags
    }

    // Writing static HTML to a file.
    await fileWriter(
      ExportedAppPageFiles.HTML,
      htmlFilepath,
      html ?? '',
      'utf8'
    )

    // Writing the request metadata to a file.
    const meta: RouteMetadata = {
      // When PPR is enabled, we don't always send 200 for routes that have been
      // pregenerated, so we should grab the status code from the mocked
      // response.
      status: renderOpts.experimental.ppr ? res.statusCode : undefined,
      headers,
      postponed,
    }

    await fileWriter(
      ExportedAppPageFiles.META,
      htmlFilepath.replace(/\.html$/, NEXT_META_SUFFIX),
      JSON.stringify(meta, null, 2)
    )

    return {
      // Only include the metadata if the environment has next support.
      metadata: hasNextSupport ? meta : undefined,
      hasEmptyPrelude: Boolean(postponed) && html === '',
      hasPostponed: Boolean(postponed),
      revalidate,
    }
  } catch (err) {
    if (!isDynamicUsageError(err)) {
      throw err
    }

    // If enabled, we should fail rendering if a client side rendering bailout
    // occurred at the page level.
    if (
      renderOpts.experimental.missingSuspenseWithCSRBailout &&
      isBailoutToCSRError(err)
    ) {
      throw err
    }

    if (debugOutput) {
      const { dynamicUsageDescription, dynamicUsageStack } = (renderOpts as any)
        .store

      logDynamicUsageWarning({
        path,
        description: dynamicUsageDescription,
        stack: dynamicUsageStack,
      })
    }

    return { revalidate: 0 }
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
