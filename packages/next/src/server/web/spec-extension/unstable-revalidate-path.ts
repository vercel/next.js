import type {
  StaticGenerationAsyncStorage,
  StaticGenerationStore,
} from '../../../client/components/static-generation-async-storage'

import { unstable_revalidateTag } from './unstable-revalidate-tag'
import { headers } from '../../../client/components/headers'
import {
  PRERENDER_REVALIDATE_HEADER,
  PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER,
} from '../../../lib/constants'

export function unstable_revalidatePath(
  path: string,
  ctx: {
    manualRevalidate?: boolean
    unstable_onlyGenerated?: boolean
  } = {}
) {
  if (!ctx?.manualRevalidate) {
    return unstable_revalidateTag(path)
  }

  const staticGenerationAsyncStorage = (
    fetch as any
  ).__nextGetStaticStore?.() as undefined | StaticGenerationAsyncStorage

  const store: undefined | StaticGenerationStore =
    staticGenerationAsyncStorage?.getStore()

  if (!store) {
    throw new Error(
      `Invariant: static generation store missing in unstable_revalidatePath ${path}`
    )
  }

  if (!store.pendingRevalidates) {
    store.pendingRevalidates = []
  }
  const previewModeId =
    store.incrementalCache?.prerenderManifest?.preview?.previewModeId ||
    process.env.__NEXT_PREVIEW_MODE_ID

  const reqHeaders: Record<string, undefined | string | string[]> =
    store.incrementalCache?.requestHeaders || Object.fromEntries(headers())

  const host = reqHeaders['host']
  const proto = store.incrementalCache?.requestProtocol || 'https'

  // TODO: glob handling + blocking/soft revalidate
  const revalidateURL = `${proto}://${host}${path}`

  const revalidateHeaders: typeof reqHeaders = {
    [PRERENDER_REVALIDATE_HEADER]: previewModeId,
    ...(ctx.unstable_onlyGenerated
      ? {
          [PRERENDER_REVALIDATE_ONLY_GENERATED_HEADER]: '1',
        }
      : {}),
  }

  const curAllowedRevalidateHeaderKeys =
    store.incrementalCache?.allowedRevalidateHeaderKeys ||
    process.env.__NEXT_ALLOWED_REVALIDATE_HEADERS

  const allowedRevalidateHeaderKeys = [
    ...(curAllowedRevalidateHeaderKeys || []),
    ...(!store.incrementalCache
      ? ['cookie', 'x-vercel-protection-bypass']
      : []),
  ]

  for (const key of Object.keys(reqHeaders)) {
    if (allowedRevalidateHeaderKeys.includes(key)) {
      revalidateHeaders[key] = reqHeaders[key] as string
    }
  }

  const fetchIPv4v6 = (v6 = false): Promise<any> => {
    const curUrl = new URL(revalidateURL)
    const hostname = curUrl.hostname

    if (!v6 && hostname === 'localhost') {
      curUrl.hostname = '127.0.0.1'
    }
    return fetch(curUrl, {
      method: 'HEAD',
      headers: revalidateHeaders as HeadersInit,
    })
      .then((res) => {
        const cacheHeader =
          res.headers.get('x-vercel-cache') || res.headers.get('x-nextjs-cache')
        if (cacheHeader?.toLowerCase() !== 'revalidated') {
          throw new Error(
            `received invalid response ${res.status} ${cacheHeader}`
          )
        }
      })
      .catch((err) => {
        if (err.code === 'ECONNREFUSED' && !v6) {
          return fetchIPv4v6(true)
        }
        console.error(`revalidatePath failed for ${revalidateURL}`, err)
      })
  }

  store.pendingRevalidates.push(fetchIPv4v6())
}
