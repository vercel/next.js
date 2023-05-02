import type {
  StaticGenerationAsyncStorage,
  StaticGenerationStore,
} from '../../../client/components/static-generation-async-storage'

import { unstable_revalidateTag } from './unstable-revalidate-tag'
import { headers } from '../../../client/components/headers'
import { makeRevalidateRequest } from '../make-revalidate-request'

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

  const reqHeaders: Record<string, undefined | string | string[]> =
    store.incrementalCache?.requestHeaders || Object.fromEntries(headers())

  const host = reqHeaders['host']
  const proto = store.incrementalCache?.requestProtocol || 'https'

  // TODO: glob handling + blocking/soft revalidate
  const revalidateURL = `${proto}://${host}${path}`

  // TODO: only revalidate if the path matches
  store.pathWasRevalidated = true

  store.pendingRevalidates.push(
    makeRevalidateRequest('HEAD', path, store, ctx)
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
        console.error(`revalidatePath failed for ${revalidateURL}`, err)
      })
  )
}
