import {
  StaticGenerationAsyncStorage,
  StaticGenerationStore,
} from '../../../client/components/static-generation-async-storage'

export function unstable_revalidateTag(tag: string) {
  const staticGenerationAsyncStorage = (
    fetch as any
  ).__nextGetStaticStore?.() as undefined | StaticGenerationAsyncStorage

  const store: undefined | StaticGenerationStore =
    staticGenerationAsyncStorage?.getStore()

  if (!store || !store.incrementalCache) {
    throw new Error(
      `Invariant: static generation store missing in unstable_revalidateTag ${tag}`
    )
  }

  if (!store.pendingRevalidates) {
    store.pendingRevalidates = []
  }
  store.pendingRevalidates.push(
    store.incrementalCache.revalidateTag?.(tag).catch((err) => {
      console.error(`revalidateTag failed for ${tag}`, err)
    })
  )

  // TODO: only revalidate if the path matches
  store.pathWasRevalidated = true
}
