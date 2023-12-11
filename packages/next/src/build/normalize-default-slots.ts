import { DEFAULT_SEGMENT, isDefaultRoute } from '../lib/is-default-route'

function parallelSegmentHasSlot(segment: string[], slot: string) {
  return segment.some((route) => route.includes(`/${slot}`))
}

export function normalizeDefaultSlots(appPaths: Record<string, string[]>) {
  // Cache keys to avoid repeated calls to Object.keys
  const appPathKeys = Object.keys(appPaths).sort((a, b) => a.length - b.length)

  for (const key of appPathKeys) {
    if (!isDefaultRoute(key)) continue

    // app paths that contain the `/default` segment can only have a single path
    const defaultSegment = appPaths[key][0]
    // /@sidebar/foo/default -> ["", "@sidebar", "foo", "default"], slot is "@sidebar"
    const slot = defaultSegment.split('/')[1]
    // find the closest parallel segment that this default segment belongs to
    // for example, the value of `/foo/default` should belong to `/foo`
    // we slice up to the point of `/default` so that we can try and match the path the default
    // corresponds with, ie `/foo`.
    const parallelSegment = key.slice(0, key.lastIndexOf(`/${DEFAULT_SEGMENT}`))
    if (
      // if we have an existing app path that this default slot could belong to
      appPaths[parallelSegment] &&
      // and that segment doesn't already have the slot (for ex, it might already contain a `/page` slot, in which case the default would be redundant)
      !parallelSegmentHasSlot(appPaths[parallelSegment], slot)
    ) {
      // add the default routes to the parallel segment's array
      appPaths[parallelSegment].push(defaultSegment)

      // check if there are others that the default route could also belong to
      // for example, `/foo/default` could also belong to `/foo/[id]` if the [id] route doesn't already have a default/page route
      const potentialParents = appPathKeys.filter(
        (parentKey) =>
          parentKey !== key &&
          parentKey.startsWith(`${parallelSegment}/`) &&
          !isDefaultRoute(parentKey)
      )

      for (const parent of potentialParents) {
        if (!parallelSegmentHasSlot(appPaths[parent], slot)) {
          appPaths[parent].push(defaultSegment)
          break
        }
      }
    }

    // delete all default routes -- they were only needed for matching parallel segments
    // and shouldn't be relied on for anything else
    delete appPaths[key]
  }

  return appPaths
}
