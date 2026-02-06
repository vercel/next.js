import { normalizeAppPath } from '../shared/lib/router/utils/app-paths'
import { isParallelRouteSegment } from '../shared/lib/segment'

// Slot information for parallel routes
export type SlotInfo = { name: string; parent: string }

// Route information for route manifests
export type RouteInfo = { route: string; filePath: string }

/**
 * Extract slot info from a page path if it contains a parallel route
 */
export function extractSlotFromPath(pagePath: string): SlotInfo | undefined {
  const segments = pagePath.split('/')
  for (let i = segments.length - 1; i >= 0; i--) {
    const segment = segments[i]
    if (isParallelRouteSegment(segment)) {
      return {
        name: segment.slice(1),
        parent: normalizeAppPath(segments.slice(0, i).join('/')),
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
  routes: { [page: string]: string },
  skipRoutes?: Set<string>
): SlotInfo[] {
  const slots: SlotInfo[] = []
  for (const [route] of Object.entries(routes)) {
    if (skipRoutes?.has(route)) continue
    addSlotIfNew(slots, route)
  }
  return slots
}

/**
 * Combine and deduplicate slot arrays
 */
export function combineSlots(...slotArrays: SlotInfo[][]): SlotInfo[] {
  const slotSet = new Set<string>()
  const result: SlotInfo[] = []
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
