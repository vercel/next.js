import type { Timestamp } from '../cache-handlers/types'

// We share the tags manifest between the "use cache" handlers and the previous
// file-system cache.
export const tagsManifest = new Map<string, number>()

export const isStale = (tags: string[], timestamp: Timestamp) => {
  for (const tag of tags) {
    const revalidatedAt = tagsManifest.get(tag)

    if (typeof revalidatedAt === 'number' && revalidatedAt >= timestamp) {
      return true
    }
  }

  return false
}
