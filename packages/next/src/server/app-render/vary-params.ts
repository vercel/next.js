import type { Params } from '../request/params'
import type { SearchParams } from '../request/search-params'
import {
  getVaryParamsAccumulator,
  workUnitAsyncStorage,
} from './work-unit-async-storage.external'

/**
 * Accumulates vary params for a single segment (or for metadata/rootParams).
 *
 * A VaryParamsAccumulator is an `AsyncIterable<string>` that can be serialized
 * by React Flight. As params are accessed during render, each newly-seen param
 * name is `add`ed, which yields it into the Flight stream immediately. After
 * rendering, call `close()` (via `finishAccumulatingVaryParams`) to end the
 * iteration.
 *
 * Because each access is flushed into the stream as it happens, the set of
 * accessed params is built up incrementally, with no step at the end of the
 * render that has to run for the client to read anything. If the prerender is
 * aborted by sync I/O, the params yielded before the abort are already in the
 * stream — and they're exactly the params the partial response depends on.
 * This mirrors how `StaleTimeIterable` works (see stale-time.ts).
 *
 * Each name is emitted at most once: `add` dedupes against the set of
 * already-yielded names, so the stream never contains a duplicate.
 *
 * NOTE: like `StaleTimeIterable`, this supports a single concurrent iteration
 * (Flight iterates it exactly once). The shared empty singleton below is the
 * only instance referenced by more than one segment, and it only ever yields
 * "done", so concurrent iteration of it is safe.
 */
export class VaryParamsAccumulator implements AsyncIterable<string> {
  private _resolve: ((result: IteratorResult<string>) => void) | null = null
  private _done = false
  private _buffer: string[] = []
  // The set of param names already yielded. Doubles as the dedupe guard so the
  // same name is never emitted twice.
  private _seen: Set<string> = new Set()

  /**
   * Records that a param was accessed. Yields the name into the stream the
   * first time it's seen; subsequent accesses of the same name are no-ops.
   */
  add(paramName: string): void {
    if (this._done || this._seen.has(paramName)) {
      return
    }
    this._seen.add(paramName)
    if (this._resolve !== null) {
      this._resolve({ value: paramName, done: false })
      this._resolve = null
    } else {
      this._buffer.push(paramName)
    }
  }

  /** Ends the iteration. Best-effort: if skipped (e.g. on a sync-I/O abort),
   * the consumer simply reads the params yielded so far. */
  close(): void {
    if (this._done) {
      return
    }
    this._done = true
    if (this._resolve !== null) {
      this._resolve({ value: undefined, done: true })
      this._resolve = null
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<string> {
    return {
      next: () => {
        if (this._buffer.length > 0) {
          return Promise.resolve({ value: this._buffer.shift()!, done: false })
        }
        if (this._done) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise<IteratorResult<string>>((resolve) => {
          this._resolve = resolve
        })
      },
    }
  }
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

/**
 * A singleton accumulator that's already closed with no params. Use this for
 * segments where we know upfront that no params will be accessed, such as
 * client components or segments without user code.
 *
 * Benefits:
 * - No need to accumulate or close later
 * - Resilient: reads as an empty set even if other tracking fails
 * - Memory efficient: reuses the same object
 *
 * It's never added to `ResponseVaryParamsAccumulator.segments` (callers pass it
 * directly), so `finishAccumulatingVaryParams` doesn't touch it.
 */
export const emptyVaryParamsAccumulator: VaryParamsAccumulator =
  new VaryParamsAccumulator()
emptyVaryParamsAccumulator.close()

export function createResponseVaryParamsAccumulator(): ResponseVaryParamsAccumulator {
  // Create the head and rootParams accumulators as top-level fields.
  // Segment accumulators are added to the segments set as they are created.
  const head = new VaryParamsAccumulator()
  const rootParams = new VaryParamsAccumulator()
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
 * Returns an iterable that yields the segment's vary params as they're
 * accessed. The iterable can be passed directly to React Flight for
 * serialization.
 */
export function createVaryParamsAccumulator(): VaryParamsAccumulator | null {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workUnitStore) {
    return null
  }
  const responseAccumulator = getVaryParamsAccumulator(workUnitStore)
  if (!responseAccumulator) {
    return null
  }
  const accumulator = new VaryParamsAccumulator()
  responseAccumulator.segments.add(accumulator)
  return accumulator
}

export function getMetadataVaryParamsAccumulator(): VaryParamsAccumulator | null {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workUnitStore) {
    return null
  }
  return getVaryParamsAccumulator(workUnitStore)?.head ?? null
}

// The metadata and viewport are always delivered in a single payload, so they
// don't need to be tracked separately. This may change in the future, but for
// now this is just an alias.
export const getViewportVaryParamsAccumulator = getMetadataVaryParamsAccumulator

/**
 * Returns the response-level root params iterable for serialization. Root
 * params are emitted once at the top level (not folded into every segment);
 * the client unions them into each segment's set.
 */
export function getRootParamsVaryParamsAccumulator(): VaryParamsAccumulator | null {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (!workUnitStore) {
    return null
  }
  return getVaryParamsAccumulator(workUnitStore)?.rootParams ?? null
}

/**
 * Records that a param was accessed. Adds the param name to the accumulator.
 */
export function accumulateVaryParam(
  accumulator: VaryParamsAccumulator,
  paramName: string
): void {
  accumulator.add(paramName)
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
            accumulateVaryParam(accumulator, prop)
          }
        }
        return Reflect.get(target, prop, receiver)
      },
      has(target, prop) {
        if (prop === optionalCatchAllParamName) {
          accumulateVaryParam(accumulator, optionalCatchAllParamName)
        }
        return Reflect.has(target, prop)
      },
      ownKeys(target) {
        // Enumerating the params object means the user's code may depend on
        // which params are present, so conservatively track the optional
        // param as accessed.
        accumulateVaryParam(accumulator, optionalCatchAllParamName)
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
  // Search params have no fixed schema, so any access — missing-key reads, `in`
  // checks, or enumeration — must register as varying. A Proxy is required
  // (rather than per-property getters) so that enumeration of an empty
  // searchParams object still triggers a vary. All accesses bucket into the
  // single sentinel '?'; the segment is keyed by the whole query string.
  // TODO: Split into per-param tracking if the cache key evolves.
  return new Proxy(originalSearchParamsObject, {
    get(target, prop, receiver) {
      if (typeof prop === 'string') {
        accumulateVaryParam(accumulator, '?')
      }
      return Reflect.get(target, prop, receiver)
    },
    has(target, prop) {
      if (typeof prop === 'string') {
        accumulateVaryParam(accumulator, '?')
      }
      return Reflect.has(target, prop)
    },
    ownKeys(target) {
      accumulateVaryParam(accumulator, '?')
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
  responseAccumulator: ResponseVaryParamsAccumulator
): void {
  responseAccumulator.head.close()
  responseAccumulator.rootParams.close()
  for (const segmentAccumulator of responseAccumulator.segments) {
    segmentAccumulator.close()
  }
}
