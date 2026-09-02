import { workAsyncStorage } from '../app-render/work-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { validateTags } from '../lib/patch-fetch'
import { createCacheTagOutsideUseCacheError } from './use-cache-messages'

export function cacheTag(...tags: string[]): void {
  if (!process.env.__NEXT_USE_CACHE) {
    throw new Error(
      '`cacheTag()` is only available with the `cacheComponents` config.'
    )
  }

  const workUnitStore = workUnitAsyncStorage.getStore()

  switch (workUnitStore?.type) {
    case 'prerender':
    case 'prerender-client':
    case 'validation-client':
    case 'prerender-runtime':
    case 'prerender-legacy':
    case 'request':
    case 'unstable-cache':
    case 'generate-static-params':
    case undefined:
      throw createCacheTagOutsideUseCacheError(
        workAsyncStorage.getStore()?.route
      )
    case 'cache':
    case 'private-cache':
      break
    default:
      workUnitStore satisfies never
  }

  const validTags = validateTags(tags, '`cacheTag()`')

  if (!workUnitStore.tags) {
    workUnitStore.tags = validTags
  } else {
    workUnitStore.tags.push(...validTags)
  }
}
