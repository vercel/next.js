import type {
  StaticGenerationAsyncStorage,
  StaticGenerationStore,
} from '../../../client/components/static-generation-async-storage.external'
import { staticGenerationBailout } from '../../../client/components/static-generation-bailout'

export function revalidateTag(tag: string) {
  const staticGenerationAsyncStorage = (
    fetch as any
  ).__nextGetStaticStore?.() as undefined | StaticGenerationAsyncStorage

  const store: undefined | StaticGenerationStore =
    staticGenerationAsyncStorage?.getStore()

  if (!store || !store.incrementalCache) {
    throw new Error(
      `Invariant: static generation store missing in revalidateTag ${tag}`
    )
  }

  // a route that makes use of revalidation APIs should be considered dynamic
  // as otherwise it would be impossible to revalidate
  staticGenerationBailout(`revalidateTag ${tag}`)

  if (!store.revalidatedTags) {
    store.revalidatedTags = []
  }
  if (!store.revalidatedTags.includes(tag)) {
    store.revalidatedTags.push(tag)
  }

  if (!store.pendingRevalidates) {
    store.pendingRevalidates = {}
  }
  store.pendingRevalidates[tag] = store.incrementalCache
    .revalidateTag?.(tag)
    .catch((err) => {
      console.error(`revalidateTag failed for ${tag}`, err)
    })

  // TODO: only revalidate if the path matches
  store.pathWasRevalidated = true
}
