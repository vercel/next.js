import { cacheAsyncStorage } from '../app-render/cache-async-storage.external'
import { validateTags } from '../lib/patch-fetch'

export function cacheTag(...tags: string[]): void {
  if (!process.env.__NEXT_USE_CACHE) {
    throw new Error(
      'cacheTag() is only available with the experimental.useCache config.'
    )
  }

  const cacheStore = cacheAsyncStorage.getStore()
  if (cacheStore?.type !== 'cache') {
    throw new Error(
      'cacheTag() can only be called inside a "use cache" function.'
    )
  }

  const validTags = validateTags(tags, 'cacheTag()')

  if (!cacheStore.tags) {
    cacheStore.tags = validTags
  } else {
    cacheStore.tags.push(...validTags)
  }
}
