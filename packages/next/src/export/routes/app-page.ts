import type { ExportPageResult } from '../types'
import type { AppPageRender } from '../../server/app-render/app-render'
import type { RenderOpts } from '../../server/app-render/types'
import type { OutgoingHttpHeaders } from 'http'
import type { NextParsedUrlQuery } from '../../server/request-meta'

import fs from 'fs/promises'
import { MockedRequest, MockedResponse } from '../../server/lib/mock-request'
import {
  RSC,
  NEXT_URL,
  NEXT_ROUTER_PREFETCH,
} from '../../client/components/app-router-headers'
import { isDynamicUsageError } from '../helpers/is-dynamic-usage-error'
import { NEXT_CACHE_TAGS_HEADER } from '../../lib/constants'
import { hasNextSupport } from '../../telemetry/ci-info'

/**
 * Lazily loads and runs the app page render function.
 */
const render: AppPageRender = (...args) => {
  return require('../../server/future/route-modules/app-page/module.compiled').renderToHTMLOrFlight(
    ...args
  )
}

export async function generatePrefetchRsc(
  req: MockedRequest,
  path: string,
  res: MockedResponse,
  pathname: string,
  htmlFilepath: string,
  renderOpts: RenderOpts
) {
  req.headers[RSC.toLowerCase()] = '1'
  req.headers[NEXT_URL.toLowerCase()] = path
  req.headers[NEXT_ROUTER_PREFETCH.toLowerCase()] = '1'

  renderOpts.supportsDynamicHTML = true
  renderOpts.isPrefetch = true
  delete renderOpts.isRevalidate

  const prefetchRenderResult = await render(req, res, pathname, {}, renderOpts)

  prefetchRenderResult.pipe(res)
  await res.hasStreamed

  const prefetchRscData = Buffer.concat(res.buffers)

  if ((renderOpts as any).store.staticPrefetchBailout) return

  await fs.writeFile(
    htmlFilepath.replace(/\.html$/, '.prefetch.rsc'),
    prefetchRscData
  )
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
  isAppPrefetch: boolean
): Promise<ExportPageResult> {
  // If the page is `/_not-found`, then we should update the page to be `/404`.
  if (page === '/_not-found') {
    pathname = '/404'
  }

  try {
    if (isAppPrefetch) {
      await generatePrefetchRsc(
        req,
        path,
        res,
        pathname,
        htmlFilepath,
        renderOpts
      )

      return { fromBuildExportRevalidate: 0 }
    }

    const result = await render(req, res, pathname, query, renderOpts)
    const html = result.toUnchunkedString()
    const { metadata } = result
    const flightData = metadata.pageData
    const revalidate = metadata.revalidate

    if (revalidate === 0) {
      if (isDynamicError) {
        throw new Error(
          `Page with dynamic = "error" encountered dynamic data method on ${path}.`
        )
      }

      if (!(renderOpts as any).store.staticPrefetchBailout) {
        await generatePrefetchRsc(
          req,
          path,
          res,
          pathname,
          htmlFilepath,
          renderOpts
        )
      }

      const { staticBailoutInfo = {} } = metadata

      if (revalidate === 0 && debugOutput && staticBailoutInfo?.description) {
        const err = new Error(
          `Static generation failed due to dynamic usage on ${path}, reason: ${staticBailoutInfo.description}`
        )

        // Update the stack if it was provided via the bailout info.
        const { stack } = staticBailoutInfo
        if (stack) {
          err.stack = err.message + stack.substring(stack.indexOf('\n'))
        }

        console.warn(err)
      }

      return { fromBuildExportRevalidate: 0 }
    }

    let headers: OutgoingHttpHeaders | undefined
    if (metadata.fetchTags) {
      headers = { [NEXT_CACHE_TAGS_HEADER]: metadata.fetchTags }
    }

    // Writing static HTML to a file.
    await fs.writeFile(htmlFilepath, html ?? '', 'utf8')

    // Writing the request metadata to a file.
    const meta = { headers }
    await fs.writeFile(
      htmlFilepath.replace(/\.html$/, '.meta'),
      JSON.stringify(meta)
    )

    // Writing the RSC payload to a file.
    await fs.writeFile(htmlFilepath.replace(/\.html$/, '.rsc'), flightData)

    return {
      fromBuildExportRevalidate: revalidate,
      // Only include the metadata if the environment has next support.
      fromBuildExportMeta: hasNextSupport ? meta : undefined,
    }
  } catch (err: any) {
    if (!isDynamicUsageError(err)) {
      throw err
    }

    return { fromBuildExportRevalidate: 0 }
  }
}
