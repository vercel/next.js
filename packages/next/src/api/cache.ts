import { unstable_cache } from '../server/web/spec-extension/unstable-cache'
import {
  revalidatePath,
  revalidateTag,
  updateTag,
  refresh,
} from '../server/web/spec-extension/revalidate'
import { unstable_noStore } from '../server/web/spec-extension/unstable-no-store'
import { io } from '../server/request/io'
import { cacheLife } from '../server/use-cache/cache-life'
import { cacheTag } from '../server/use-cache/cache-tag'
import {
  unstable_navigation,
  unstable_prefetch,
} from '../server/request/cache-stages'

export {
  unstable_cache,
  revalidatePath,
  revalidateTag,
  updateTag,
  refresh,
  unstable_noStore,
  io,
  cacheLife,
  cacheTag,
  unstable_navigation,
  unstable_prefetch,
}

let didWarnCacheLife = false
export function unstable_cacheLife(...args: Parameters<typeof cacheLife>) {
  if (!didWarnCacheLife) {
    didWarnCacheLife = true
    const error = new Error(
      '`unstable_cacheLife` was recently stabilized and should be imported as `cacheLife`. The `unstable` prefixed form will be removed in a future version of Next.js.'
    )
    console.error(error)
  }
  return cacheLife(...args)
}

let didWarnCacheTag = false
export function unstable_cacheTag(...args: Parameters<typeof cacheTag>) {
  if (!didWarnCacheTag) {
    didWarnCacheTag = true
    const error = new Error(
      '`unstable_cacheTag` was recently stabilized and should be imported as `cacheTag`. The `unstable` prefixed form will be removed in a future version of Next.js.'
    )
    console.error(error)
  }
  return cacheTag(...args)
}
