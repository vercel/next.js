import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { validateTags } from '../lib/patch-fetch'

export function cacheTag(...tags: string[]): void {
  if (!process.env.__NEXT_USE_CACHE) {
    throw new Error(
      'cacheTag() is only available with the experimental.useCache config.'
    )
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workUnitStore || workUnitStore.type !== 'cache') {
    throw new Error(
      'cacheTag() can only be called inside a "use cache" function.'
    )
  }

  const validTags = validateTags(tags, 'cacheTag()')

  if (!workUnitStore.tags) {
    workUnitStore.tags = validTags
  } else {
    workUnitStore.tags.push(...validTags)
  }
}
