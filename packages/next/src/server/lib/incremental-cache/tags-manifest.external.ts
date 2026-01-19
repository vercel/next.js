import type { Timestamp } from '../cache-handlers/types'

export interface TagManifestEntry {
  stale?: number
  expired?: number
}

// We share the tags manifest between the "use cache" handlers and the previous
// file-system cache.
export const tagsManifest = new Map<string, TagManifestEntry>()

export const areTagsExpired = (tags: string[], timestamp: Timestamp) => {
  for (const tag of tags) {
    const entry = tagsManifest.get(tag)
    const expiredAt = entry?.expired

    if (typeof expiredAt === 'number') {
      const now = Date.now()
      // For immediate expiration (expiredAt <= now) and tag was invalidated after entry was created
      // OR for future expiration that has now passed (expiredAt > timestamp && expiredAt <= now)
      const isImmediatelyExpired = expiredAt <= now && expiredAt > timestamp

      if (isImmediatelyExpired) {
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
