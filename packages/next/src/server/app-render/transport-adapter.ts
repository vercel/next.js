import type {
  CacheNodeSeedData,
  FlightDataPath,
  FlightRouterState,
  HeadData,
} from '../../shared/lib/app-router-types'
import type { VaryParamsIterable } from '../../shared/lib/segment-cache/vary-params-decoding'
import type {
  FullTransportData,
  FullTransportNode,
  PartialTransportData,
  PartialTransportNode,
  TransportSegmentData,
} from '../../shared/lib/rsc-transport'
import { segmentToTransportSegment } from '../../shared/lib/rsc-transport'

/**
 * Adapts the render's internal output — FlightDataPath entries, each carrying
 * a FlightRouterState patch and a CacheNodeSeedData tree — into the transport
 * format: a single root-anchored tree where every node carries both its
 * identity and (optionally) its render output.
 *
 * TODO: This is a transitional step. Eventually the render should produce
 * transport nodes directly, at which point the internal FlightDataPath /
 * CacheNodeSeedData representation (and this adapter) can be deleted.
 */

/**
 * Marks a segment's position as covered by the response without carrying any
 * output for it. Used for the segments along the path from the root to a
 * rendered subtree: the client already has them; the response is only
 * accounting for their position.
 */
function createCoveredSegmentData(): TransportSegmentData {
  return { r: null, p: true, v: null }
}

/**
 * Converts a rendered subtree — a FlightRouterState patch zipped with its
 * CacheNodeSeedData — into a transport node.
 */
function convertRenderedSubtree(
  routerState: FlightRouterState,
  seedData: CacheNodeSeedData | null
): PartialTransportNode {
  const node: PartialTransportNode = {
    s: segmentToTransportSegment(routerState[0]),
  }
  const hints = routerState[4]
  if (hints !== undefined && hints !== 0) {
    node.h = hints
  }
  if (seedData !== null) {
    node.d = { r: seedData[0], p: seedData[3], v: seedData[4] }
  }
  const routerStateChildren = routerState[1]
  const seedDataChildren = seedData !== null ? seedData[1] : null
  let children: Map<string, PartialTransportNode> | undefined
  for (const parallelRouteKey in routerStateChildren) {
    const childSeedData =
      seedDataChildren !== null
        ? (seedDataChildren[parallelRouteKey] ?? null)
        : null
    if (children === undefined) {
      children = new Map()
    }
    children.set(
      parallelRouteKey,
      convertRenderedSubtree(
        routerStateChildren[parallelRouteKey],
        childSeedData
      )
    )
  }
  if (children !== undefined) {
    node.c = children
  }
  return node
}

/**
 * Converts the output of the shared-layout diff (one or more FlightDataPath
 * entries, with the root segment already stripped) into a single partial
 * transport tree.
 *
 * Each path is a repeating [parallelRouteKey, segment] prefix followed by
 * [routerStatePatch, seedData, head, isHeadPartial]. The prefixes become
 * covered-but-not-rendered nodes; the patches become rendered subtrees. All
 * paths share the same head, so it's emitted once at the response level.
 */
export function convertFlightDataPathsToPartialTransportData(
  flightDataPaths: FlightDataPath[],
  headVaryParams: VaryParamsIterable | null
): PartialTransportData {
  const root: PartialTransportNode = {
    s: '',
  }
  let head: TransportSegmentData | undefined

  for (const flightDataPath of flightDataPaths) {
    const prefixLength = flightDataPath.length - 4
    if (prefixLength > 0 && root.d === undefined) {
      // The rendered subtree is below the root, so the root is a covered
      // position.
      root.d = createCoveredSegmentData()
    }
    const routerStatePatch: FlightRouterState = flightDataPath[prefixLength]
    const seedData: CacheNodeSeedData | null = flightDataPath[prefixLength + 1]
    const headNode: HeadData = flightDataPath[prefixLength + 2]
    const isHeadPartial: boolean = flightDataPath[prefixLength + 3]

    if (head === undefined) {
      // The head is identical across all paths in a response; take the
      // first one.
      head = { r: headNode, p: isHeadPartial, v: headVaryParams }
    }

    // Walk the [parallelRouteKey, segment] prefix, creating covered nodes
    // along the way, then attach the rendered subtree at the anchor.
    let parent = root
    let index = 0
    while (index < prefixLength - 2) {
      const parallelRouteKey: string = flightDataPath[index]
      const segment = flightDataPath[index + 1]
      let children = parent.c
      if (children === undefined) {
        children = parent.c = new Map()
      }
      let child = children.get(parallelRouteKey)
      if (child === undefined) {
        child = {
          s: segmentToTransportSegment(segment),
          d: createCoveredSegmentData(),
        }
        children.set(parallelRouteKey, child)
      }
      parent = child
      index += 2
    }

    const subtree = convertRenderedSubtree(routerStatePatch, seedData)
    if (prefixLength === 0) {
      // A root render. The rendered subtree *is* the root of the
      // transport tree.
      root.s = subtree.s
      if (subtree.h !== undefined) {
        root.h = subtree.h
      }
      if (subtree.d !== undefined) {
        root.d = subtree.d
      }
      if (subtree.c !== undefined) {
        root.c = subtree.c
      }
    } else {
      const parallelRouteKey: string = flightDataPath[prefixLength - 2]
      let children = parent.c
      if (children === undefined) {
        children = parent.c = new Map()
      }
      children.set(parallelRouteKey, subtree)
    }
  }

  const transportData: PartialTransportData = { t: root }
  if (head !== undefined) {
    transportData.h = head
  }
  return transportData
}

/**
 * Converts the full render of an initial document (or error) payload into a
 * full transport tree. Structure without seed data — which only occurs in
 * hand-constructed error payloads, where the seed data covers only the root —
 * is emitted as covered-but-not-rendered rather than omitted, preserving the
 * "full trees have no lazy holes" property.
 */
export function convertInitialFlightDataToFullTransportData(
  routerState: FlightRouterState,
  seedData: CacheNodeSeedData,
  head: HeadData,
  isHeadPartial: boolean,
  headVaryParams: VaryParamsIterable | null
): FullTransportData {
  return {
    t: convertFullSubtree(routerState, seedData),
    h: { r: head, p: isHeadPartial, v: headVaryParams },
  }
}

function convertFullSubtree(
  routerState: FlightRouterState,
  seedData: CacheNodeSeedData | null
): FullTransportNode {
  const node: FullTransportNode = {
    s: segmentToTransportSegment(routerState[0]),
    d:
      seedData !== null
        ? { r: seedData[0], p: seedData[3], v: seedData[4] }
        : createCoveredSegmentData(),
  }
  const hints = routerState[4]
  if (hints !== undefined && hints !== 0) {
    node.h = hints
  }
  const routerStateChildren = routerState[1]
  const seedDataChildren = seedData !== null ? seedData[1] : null
  let children: Map<string, FullTransportNode> | undefined
  for (const parallelRouteKey in routerStateChildren) {
    const childSeedData =
      seedDataChildren !== null
        ? (seedDataChildren[parallelRouteKey] ?? null)
        : null
    if (children === undefined) {
      children = new Map()
    }
    children.set(
      parallelRouteKey,
      convertFullSubtree(routerStateChildren[parallelRouteKey], childSeedData)
    )
  }
  if (children !== undefined) {
    node.c = children
  }
  return node
}
