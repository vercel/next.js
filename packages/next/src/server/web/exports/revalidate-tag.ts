import type { IncrementalCache } from '../../lib/incremental-cache'

// This file is for modularized imports for next/server to get fully-treeshaking.
export default async function revalidateTag(tag: string) {
  const incrementalCache: IncrementalCache | undefined = (
    globalThis as any
  ).__nextStaticGenerationAsyncStorage?.getStore()?.incrementalCache

  if (!incrementalCache) {
    throw new Error(`Invariant missing revalidate store`)
  }
  return await incrementalCache.revalidateTag(tag)
}
