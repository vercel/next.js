import {
  addToLedger,
  closeLedger,
  createSetLedger,
  VaryParamsLedger,
  getLedgerValue,
  type SetLedger,
} from './ledgers'
import type { Params } from '../request/params'
import type { SearchParams } from '../request/search-params'
import {
  type WorkUnitStore,
  getVaryParamsAccumulator,
  workUnitAsyncStorage,
} from './work-unit-async-storage.external'

export type ResponseVaryParamsTarget =
  | ResponseVaryParamsAccumulator
  | SetLedger<string>

/**
 * A mutable data structure for accumulating per-segment vary params for an
 * entire server response. It's only used during prerenders. It describes
 * metadata about the response itself.
 */
export type ResponseVaryParamsAccumulator = {
  /** Vary params accumulator for metadata/viewport (the "head" segment) */
  head: SetLedger<string>
  /** Vary params accumulator for root params access */
  rootParams: SetLedger<string>
  /** Vary params accumulators for each route segment */
  segments: Set<SetLedger<string>>
}

export function createResponseVaryParamsTarget(
  builtInLedger: SetLedger<string>
): ResponseVaryParamsTarget {
  if (process.env.__NEXT_LEDGERS) {
    return createSetLedger(builtInLedger)
  }
  return {
    head: createSetLedger(builtInLedger),
    rootParams: createSetLedger(builtInLedger),
    segments: new Set(),
  }
}

function getVaryParamsTarget(
  scope: 'segment' | 'head' | 'rootParams'
): SetLedger<string> | null {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workUnitStore) {
    return null
  }
  return getVaryParamsTargetForWorkUnit(workUnitStore, scope)
}

function getVaryParamsTargetForWorkUnit(
  workUnitStore: WorkUnitStore,
  scope: 'segment' | 'head' | 'rootParams'
): SetLedger<string> | null {
  const target = getVaryParamsAccumulator(workUnitStore)
  if (target === null) {
    return null
  }
  if (process.env.__NEXT_LEDGERS) {
    return target as SetLedger<string>
  }
  const responseAccumulator = target as ResponseVaryParamsAccumulator
  if (scope !== 'segment') {
    return responseAccumulator[scope]
  }
  const accumulator = createSetLedger(VaryParamsLedger)
  responseAccumulator.segments.add(accumulator)
  return accumulator
}

export function createVaryParamsAccumulator(): SetLedger<string> | null {
  return getVaryParamsTarget('segment')
}

export function getMetadataVaryParamsAccumulator(): SetLedger<string> | null {
  return getVaryParamsTarget('head')
}

/**
 * Returns the response-level root params iterable for serialization. Root
 * params are emitted once at the top level (not folded into every segment);
 * the client unions them into each segment's set.
 */
export function getRootParamsVaryParamsAccumulator(): AsyncIterable<string> | null {
  return getLedgerValue(getVaryParamsTarget('rootParams')) ?? null
}

/**
 * Records a root param access.
 */
export function accumulateRootVaryParam(paramName: string): void {
  const target = getVaryParamsTarget('rootParams')
  if (target !== null) {
    addToLedger(target, paramName)
  }
}

/**
 * Records a root param access against a specific work unit, for accesses
 * reported from outside the work unit that owns them: a "use cache" entry
 * propagating the root params it read to the render that consumed it.
 */
export function accumulateRootVaryParamForWorkUnit(
  workUnitStore: WorkUnitStore,
  paramName: string
): void {
  const target = getVaryParamsTargetForWorkUnit(workUnitStore, 'rootParams')
  if (target !== null) {
    addToLedger(target, paramName)
  }
}

export function createVaryingParams(
  accumulator: SetLedger<string>,
  originalParamsObject: Params,
  optionalCatchAllParamName: string | null
): Params {
  if (optionalCatchAllParamName !== null) {
    // When there's an optional catch-all param with no value (e.g.,
    // [[...slug]] at /), the param doesn't exist as a property on the params
    // object. Use a Proxy to track all param access — both existing params
    // and the missing optional param — including enumeration patterns like
    // Object.keys(), spread, for...in, and `in` checks.
    return new Proxy(originalParamsObject, {
      get(target, prop, receiver) {
        if (typeof prop === 'string') {
          if (
            prop === optionalCatchAllParamName ||
            Object.prototype.hasOwnProperty.call(target, prop)
          ) {
            addToLedger(accumulator, prop)
          }
        }
        return Reflect.get(target, prop, receiver)
      },
      has(target, prop) {
        if (prop === optionalCatchAllParamName) {
          addToLedger(accumulator, optionalCatchAllParamName)
        }
        return Reflect.has(target, prop)
      },
      ownKeys(target) {
        // Enumerating the params object means the user's code may depend on
        // which params are present, so conservatively track the optional
        // param as accessed.
        addToLedger(accumulator, optionalCatchAllParamName)
        return Reflect.ownKeys(target)
      },
    })
  }

  // When there's no optional catch-all, all params exist as properties on the
  // object, so we can use defineProperty getters instead of a Proxy. This is
  // faster because the engine can optimize property access on regular objects
  // more aggressively than Proxy trap calls.
  const underlyingParamsWithVarying: Params = {}
  for (const paramName in originalParamsObject) {
    Object.defineProperty(underlyingParamsWithVarying, paramName, {
      get() {
        addToLedger(accumulator, paramName)
        return originalParamsObject[paramName]
      },
      enumerable: true,
    })
  }
  return underlyingParamsWithVarying
}

export function createVaryingSearchParams(
  accumulator: SetLedger<string>,
  originalSearchParamsObject: SearchParams
): SearchParams {
  // Search params have no fixed schema, so any access — missing-key reads, `in`
  // checks, or enumeration — must register as varying. A Proxy is required
  // (rather than per-property getters) so that enumeration of an empty
  // searchParams object still triggers a vary. All accesses bucket into the
  // single sentinel '?'; the segment is keyed by the whole query string.
  // TODO: Split into per-param tracking if the cache key evolves.
  return new Proxy(originalSearchParamsObject, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        addToLedger(accumulator, '?')
      }
      return Reflect.get(target, prop, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        addToLedger(accumulator, '?')
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      addToLedger(accumulator, '?')
      return Reflect.ownKeys(target)
    },
  })
}

/**
 * Closes all accumulators in a ResponseVaryParamsAccumulator, ending their
 * iterables. Call this after rendering is complete.
 *
 * This does NOT merge root params into each segment — root params are
 * serialized separately (at the top level of the response) and unioned in by
 * the client. And it's best-effort: if it's skipped because the render was
 * aborted by sync I/O, the consumer just reads the params each iterable yielded
 * before the abort.
 *
 * If we can't track vary params (e.g., legacy prerender), simply don't call
 * this function - the client treats a missing iterable as "unknown" vary
 * params.
 */
export function finishAccumulatingVaryParams(
  target: ResponseVaryParamsTarget
): void {
  if (process.env.__NEXT_LEDGERS) {
    return
  }
  const responseAccumulator = target as ResponseVaryParamsAccumulator
  closeLedger(responseAccumulator.head)
  closeLedger(responseAccumulator.rootParams)
  for (const segmentAccumulator of responseAccumulator.segments) {
    closeLedger(segmentAccumulator)
  }
}
