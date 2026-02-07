import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { validateTags } from '../lib/patch-fetch'

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
    case 'prerender-runtime':
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'request':
    case 'unstable-cache':
    case undefined:
      throw new Error(
        '`cacheTag()` can only be called inside a "use cache" function.'
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
