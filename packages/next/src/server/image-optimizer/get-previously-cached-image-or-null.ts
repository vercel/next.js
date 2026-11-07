import type {
  CachedImageValue,
  IncrementalCacheEntry,
} from '../response-cache/types'
import type { ImageUpstream } from './transform'

export function getPreviouslyCachedImageOrNull(
  upstreamImage: ImageUpstream,
  previousCacheEntry: IncrementalCacheEntry | null | undefined
): CachedImageValue | null {
  if (
    previousCacheEntry?.value?.kind === 'IMAGE' &&
    // Images that are SVGs, animated or failed the optimization previously end up using upstreamEtag as their etag as well,
    // in these cases we want to trigger a new "optimization" attempt.
    previousCacheEntry.value.upstreamEtag !== previousCacheEntry.value.etag &&
    // and the upstream etag is the same as the previous cache entry's
    upstreamImage.etag === previousCacheEntry.value.upstreamEtag
  ) {
    return previousCacheEntry.value
  }
  return null
}
