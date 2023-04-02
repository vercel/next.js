import type { IncrementalCache } from '../../lib/incremental-cache'

import isError from '../../../lib/is-error'
import {
  PRERENDER_REVALIDATE_HEADER,
  PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER,
} from '../../../lib/constants'

// This file is for modularized imports for next/server to get fully-treeshaking.
export default async function revalidatePath(
  pathname: string,
  opts: {
    unstable_onlyGenerated?: boolean
  } = {}
) {
  const incrementalCache: IncrementalCache | undefined = (
    globalThis as any
  ).__nextStaticGenerationAsyncStorage?.getStore()?.incrementalCache

  if (!incrementalCache) {
    throw new Error(`Invariant missing revalidate store`)
  }
  const previewId = incrementalCache.prerenderManifest?.preview?.previewModeId
  const host = incrementalCache.host
  const port = incrementalCache.port
  const protocol = incrementalCache.protocol || 'https'
  const trustHostHeader = incrementalCache.trustHostHeader
  const requestHeaders = incrementalCache.requestHeaders

  if (!host || !protocol || !previewId || !requestHeaders) {
    throw new Error(`Invariant invalid revalidate store received`)
  }

  try {
    const revalidateUrl = `${protocol || 'https'}://${host}${
      port ? `:${port}` : ''
    }${pathname}`

    const revalidateHeaders: HeadersInit = {
      [PRERENDER_REVALIDATE_HEADER]: previewId,
      ...(opts.unstable_onlyGenerated
        ? {
            [PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER]: '1',
          }
        : {}),
    }

    const allowedRevalidateHeaderKeys = [
      ...(incrementalCache.allowedRevalidateHeaderKeys || []),
      ...(trustHostHeader ? ['cookie', 'x-vercel-protection-bypass'] : []),
    ]

    for (const key of Object.keys(requestHeaders || {})) {
      if (allowedRevalidateHeaderKeys.includes(key)) {
        revalidateHeaders[key] = requestHeaders[key] as string
      }
    }

    const res = await fetch(revalidateUrl, {
      headers: revalidateHeaders,
      method: 'HEAD',
    })

    // we use the cache header to determine successful revalidate as
    // a non-200 status code can be returned from a successful revalidate
    // e.g. notFound: true returns 404 status code but is successful
    const cacheHeader =
      res.headers.get('x-vercel-cache') || res.headers.get('x-nextjs-cache')

    if (
      cacheHeader?.toUpperCase() !== 'REVALIDATED' &&
      !(res.status === 404 && opts.unstable_onlyGenerated)
    ) {
      throw new Error(`Invalid response ${res.status}`)
    }
  } catch (err: unknown) {
    throw new Error(
      `Failed to revalidate ${pathname}: ${isError(err) ? err.message : err}`
    )
  }
}
