import type { Params } from '../request/params'
import type { SearchParams } from '../request/search-params'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'
import type {
  VaryParamsThenable,
  VaryParams,
} from '../../shared/lib/segment-cache/vary-params-decoding'

/**
 * Accumulates vary params for a single segment (or for metadata/rootParams).
 *
 * VaryParamsAccumulator is also a thenable that can be serialized by React
 * Flight. The accumulator starts as 'pending' and accumulates param accesses
 * during render. Call `finishTrackingVaryParams()` after rendering to resolve
 * all accumulators.
 *
 * The `status` and `value` fields follow the React Flight thenable protocol:
 * when `status === 'fulfilled'`, Flight can read `value` synchronously without
 * scheduling a microtask via `.then()`.
 */
export type VaryParamsAccumulator = {
  // Mutable during render - accumulates param access
  varyParams: VaryParams

  // React thenable protocol fields
  status: 'pending' | 'fulfilled'
  value: VaryParams
  then(
    onfulfilled?: ((value: Set<string>) => unknown) | null,
    onrejected?: ((reason: unknown) => unknown) | null
  ): void

  // Internal - callbacks waiting for resolution
  resolvers: Array<(value: Set<string>) => void>
}

/**
 * A mutable data structure for accumulating per-segment vary params for an
 * entire server response. It's only used during prerenders. It describes
 * metadata about the response itself.
 */
export type ResponseVaryParamsAccumulator = {
  /** Vary params accumulator for metadata/viewport (the "head" segment) */
  head: VaryParamsAccumulator
  /** Vary params accumulator for root params access */
  rootParams: VaryParamsAccumulator
  /** Vary params accumulators for each route segment */
  segments: Set<VaryParamsAccumulator>
}

function createSegmentVaryParamsAccumulator(): VaryParamsAccumulator {
  const accumulator: VaryParamsAccumulator = {
    varyParams: new Set(),
    status: 'pending',
    value: new Set(),
    then(onfulfilled: ((value: Set<string>) => unknown) | null | undefined) {
      if (onfulfilled) {
        if (accumulator.status === 'pending') {
          accumulator.resolvers.push(onfulfilled)
        } else {
          onfulfilled(accumulator.value)
        }
      }
    },
    resolvers: [],
  }
  return accumulator
}

/**
 * A singleton accumulator that's already resolved to an empty Set. Use this for
 * segments where we know upfront that no params will be accessed, such as
 * client components or segments without user code.
 *
 * Benefits:
 * - No need to accumulate or resolve later
 * - Resilient: resolves correctly even if other tracking fails
 * - Memory efficient: reuses the same object
 */
const emptySet: VaryParams = new Set()
export const emptyVaryParamsAccumulator: VaryParamsAccumulator = {
  varyParams: emptySet,
  status: 'fulfilled',
  value: emptySet,
  then(onfulfilled: ((value: Set<string>) => unknown) | null | undefined) {
    if (onfulfilled) {
      onfulfilled(emptySet)
    }
  },
  resolvers: [],
}

export function createResponseVaryParamsAccumulator(): ResponseVaryParamsAccumulator {
  // Create the head and rootParams accumulators as top-level fields.
  // Segment accumulators are added to the segments set as they are created.
  const head = createSegmentVaryParamsAccumulator()
  const rootParams = createSegmentVaryParamsAccumulator()
  const segments = new Set<VaryParamsAccumulator>()

  return {
    head,
    rootParams,
    segments,
  }
}

/**
 * Allocates a new VaryParamsAccumulator and adds it to the response accumulator
 * associated with the current WorkUnitStore.
 *
 * Returns a thenable that resolves to the segment's vary params once rendering
 * is complete. The thenable can be passed directly to React Flight for
 * serialization.
 */
export function createVaryParamsAccumulator(): VaryParamsAccumulator | null {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-runtime': {
        const responseAccumulator = workUnitStore.varyParamsAccumulator
        if (responseAccumulator !== null) {
          const accumulator = createSegmentVaryParamsAccumulator()
          responseAccumulator.segments.add(accumulator)
          return accumulator
        }
        return null
      }
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'request':
      case 'cache':
      case 'private-cache':
      case 'prerender-client':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }
  }
  return null
}

export function getMetadataVaryParamsAccumulator(): VaryParamsAccumulator | null {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-runtime': {
        const responseAccumulator = workUnitStore.varyParamsAccumulator
        if (responseAccumulator !== null) {
          return responseAccumulator.head
        }
        return null
      }
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'request':
      case 'cache':
      case 'private-cache':
      case 'prerender-client':
      case 'unstable-cache':
        return null
      default:
        workUnitStore satisfies never
    }
  }
  return null
}

export function getVaryParamsThenable(
  accumulator: VaryParamsAccumulator
): VaryParamsThenable | null {
  return accumulator as unknown as VaryParamsThenable | null
}

export function getMetadataVaryParamsThenable(): VaryParamsThenable | null {
  const accumulator = getMetadataVaryParamsAccumulator()
  if (accumulator !== null) {
    return getVaryParamsThenable(accumulator)
  }
  return null
}

// The metadata and viewport are always delivered in a single payload, so they
// don't need to be tracked separately. This may change in the future, but for
// now this is just an alias.
export const getViewportVaryParamsAccumulator = getMetadataVaryParamsAccumulator

export function getRootParamsVaryParamsAccumulator(): VaryParamsAccumulator | null {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
      case 'prerender-runtime': {
        const responseAccumulator = workUnitStore.varyParamsAccumulator
        if (responseAccumulator !== null) {
          return responseAccumulator.rootParams
        }
        return null
      }
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'request':
      case 'cache':
      case 'private-cache':
      case 'prerender-client':
      case 'unstable-cache':
        return null
      default:
        workUnitStore satisfies never
    }
  }
  return null
}

/**
 * Records that a param was accessed. Adds the param name to the accumulator's
 * varyParams set.
 */
export function accumulateVaryParam(
  accumulator: VaryParamsAccumulator,
  paramName: string
): void {
  accumulator.varyParams.add(paramName)
}

/**
 * Records a root param access.
 */
export function accumulateRootVaryParam(paramName: string): void {
  const rootParamsAccumulator = getRootParamsVaryParamsAccumulator()
  if (rootParamsAccumulator !== null) {
    accumulateVaryParam(rootParamsAccumulator, paramName)
  }
}

export function createVaryingParams(
  accumulator: VaryParamsAccumulator,
  originalParamsObject: Params
): Params {
  const underlyingParamsWithVarying: Params = {}
  for (const paramName in originalParamsObject) {
    Object.defineProperty(underlyingParamsWithVarying, paramName, {
      get() {
        accumulateVaryParam(accumulator, paramName)
        return originalParamsObject[paramName]
      },
      enumerable: true,
    })
  }
  return underlyingParamsWithVarying
}

export function createVaryingSearchParams(
  accumulator: VaryParamsAccumulator,
  originalSearchParamsObject: SearchParams
): SearchParams {
  const underlyingSearchParamsWithVarying: SearchParams = {}
  for (const searchParamName in originalSearchParamsObject) {
    Object.defineProperty(underlyingSearchParamsWithVarying, searchParamName, {
      get() {
        // TODO: Unlike path params, we don't vary track each search param
        // individually. The entire search string is treated as a single param.
        // This may change in the future.
        accumulateVaryParam(accumulator, '?')
        return originalSearchParamsObject[searchParamName]
      },
      enumerable: true,
    })
  }
  return underlyingSearchParamsWithVarying
}

/**
 * Resolves all segment accumulators in a ResponseVaryParamsAccumulator with
 * their final vary params. Call this after rendering is complete.
 *
 * Each segment's thenable is resolved with its vary params merged with the
 * root params. If we can't track vary params (e.g., legacy prerender), simply
 * don't call this function - the client treats unresolved thenables as
 * "unknown" vary params.
 */
export async function finishAccumulatingVaryParams(
  responseAccumulator: ResponseVaryParamsAccumulator
): Promise<void> {
  const rootVaryParams = responseAccumulator.rootParams.varyParams

  // Resolve head
  finishSegmentAccumulator(responseAccumulator.head, rootVaryParams)

  // Resolve each segment
  for (const segmentAccumulator of responseAccumulator.segments) {
    finishSegmentAccumulator(segmentAccumulator, rootVaryParams)
  }

  // Now that the thenables are resolved, Flight should be able to flush the
  // vary params into the response stream. This work gets scheduled internally
  // by Flight using a microtask as soon as we notify the thenable listeners.
  //
  // We need to ensure that Flight's pending queues are emptied before this
  // function returns; the caller will abort the prerender immediately after.
  // We can't use a macrotask, because that would allow dynamic IO to sneak
  // into the response. So we use microtasks instead.
  //
  // The exact number of awaits here isn't important (indeed, one seems to be
  // sufficient, at the time of writing), as long as we wait enough ticks for
  // Flight to finish writing the response.
  //
  // Anything that remains in Flight's internal queue after these awaits must
  // be actual dynamic IO, not caused by pending vary params tasks. In other
  // words, failing to do this would cause us to treat a fully static prerender
  // as if it were partially dynamic.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

function finishSegmentAccumulator(
  accumulator: VaryParamsAccumulator,
  rootVaryParams: VaryParams
): void {
  if (accumulator.status !== 'pending') {
    return
  }
  const merged = new Set<string>(accumulator.varyParams)
  for (const param of rootVaryParams) {
    merged.add(param)
  }
  accumulator.value = merged
  accumulator.status = 'fulfilled'
  for (const resolver of accumulator.resolvers) {
    resolver(merged)
  }
  accumulator.resolvers = []
}
