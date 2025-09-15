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

    if (entry) {
      if (entry.expired && entry.expired >= timestamp) {
        return true
      }
    }
  }

  return false
}

export const areTagsStale = (tags: string[], timestamp: Timestamp) => {
  for (const tag of tags) {
    const entry = tagsManifest.get(tag)

    if (entry) {
      if (entry.stale && entry.stale >= timestamp) {
        return true
      }
    }
  }

  return false
}
