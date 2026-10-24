import type { Timestamp } from '../cache-handlers/types'

export interface TagManifestEntry {
  stale?: number
  expired?: number
  /**
   * When the revalidation that set `expired` happened. `expired` only applies
   * to entries created before then, since entries created later already
   * reflect that revalidation.
   */
  revalidatedAt?: number
}

// We share the tags manifest between the "use cache" handlers and the previous
// file-system cache.
export const tagsManifest = new Map<string, TagManifestEntry>()

export const areTagsExpired = (tags: string[], timestamp: Timestamp) => {
  for (const tag of tags) {
    const entry = tagsManifest.get(tag)
    const expiredAt = entry?.expired

    if (typeof expiredAt === 'number') {
      const now = performance.timeOrigin + performance.now()
      const revalidatedAt = entry?.revalidatedAt ?? expiredAt

      if (expiredAt <= now && revalidatedAt > timestamp) {
        return true
      }
    }
  }

  return false
}

export const areTagsStale = (tags: string[], timestamp: Timestamp) => {
  for (const tag of tags) {
    const entry = tagsManifest.get(tag)
    const staleAt = entry?.stale ?? 0

    if (typeof staleAt === 'number' && staleAt > timestamp) {
      return true
    }
  }

  return false
}
