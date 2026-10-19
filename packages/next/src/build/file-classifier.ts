import type { Page, Route } from '../shared/lib/route-types'
import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import { isParallelRouteSegment } from '../shared/lib/segment'

// Slot information for parallel routes
export type SlotInfo<Path extends string = string> = {
  name: string
  parent: Path
}

// Route information for route manifests
export type RouteInfo<Path extends string = string> = {
  route: Path
  filePath: string
}

/**
 * Extract slot info from a page path if it contains a parallel route
 */
export function extractSlotFromPath(
  pagePath: string
): SlotInfo<Route> | undefined {
  const segments = pagePath.split('/')
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]
    if (isParallelRouteSegment(segment)) {
      return {
        name: segment.slice(1),
        // TODO: Human review: this slot-parent directory prefix is not a
        // complete Page module; a real trailing page/route directory may be
        // stripped as a leaf. Preserve existing discovery and scope its URL
        // result view here, rather than branding the prefix as a module ID.
        parent: normalizeAppPath(segments.slice(0, i).join('/')) as Route,
      }
    }
  }
  return undefined
}

/**
 * Add a slot to the slots array if it doesn't already exist
 */
export function addSlotIfNew(slots: SlotInfo[], pagePath: string): boolean {
  const slot = extractSlotFromPath(pagePath)
  if (!slot) return false
  if (slots.some((s) => s.name === slot.name && s.parent === slot.parent))
    return false
  slots.push(slot)
  return true
}

/**
 * Extract slots from a route mapping object
 */
export function extractSlotsFromRoutes(
  routes: Record<Page, string>,
  skipRoutes?: ReadonlySet<string>
): SlotInfo<Route>[] {
  const slots: SlotInfo<Route>[] = []
  for (const [route] of Object.entries(routes) as [Page, string][]) {
    if (skipRoutes?.has(route)) continue
    addSlotIfNew(slots, route)
  }
  return slots
}

/**
 * Combine and deduplicate slot arrays
 */
export function combineSlots<Path extends string>(
  ...slotArrays: SlotInfo<Path>[][]
): SlotInfo<Path>[] {
  const slotSet = new Set<string>()
  const result: SlotInfo<Path>[] = []
  for (const slots of slotArrays) {
    for (const slot of slots) {
      const key = `${slot.name}:${slot.parent}`
      if (!slotSet.has(key)) {
        slotSet.add(key)
        result.push(slot)
      }
    }
  }
  return result
}
