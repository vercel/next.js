type TagsManifest = {
  items: { [tag: string]: { revalidatedAt?: number } }
}

// we share tags manifest between "use cache" handlers and
// previous file-system-cache
export const tagsManifest: TagsManifest = {
  items: {},
}

export const isTagStale = (tags: string[], timestamp: number) => {
  for (const tag of tags) {
    const tagEntry = tagsManifest.items[tag]
    if (
      typeof tagEntry?.revalidatedAt === 'number' &&
      // TODO: use performance.now and update file-system-cache?
      tagEntry.revalidatedAt >= timestamp
    ) {
      return true
    }
  }
  return false
}
