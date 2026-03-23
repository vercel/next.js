/**
 * Cache Info
 *
 * Machinery for tracking streaming metadata about Flight prerender responses.
 *
 * During a prerender, certain information (like the cache stage level) is not
 * known until rendering completes. This module provides thenables that follow
 * the React Flight thenable protocol: they are embedded in the Flight payload
 * before rendering begins, then resolved right before the prerender is aborted.
 * Flight serializes the resolved values lazily into the response stream.
 *
 * This pattern is only used for prerender responses (not dynamic requests or
 * navigations), because only prerenders have the two-phase lifecycle where the
 * payload is constructed before the final values are known.
 *
 * TODO: Vary params (see vary-params.ts) use the same pattern — a thenable
 * embedded in the response, resolved after rendering, serialized by Flight.
 * The shared parts of that implementation should be unified into this module
 * so each new piece of cache info doesn't need its own thenable type, create
 * function, and resolve function.
 */

import type { CacheInfo } from '../../shared/lib/segment-cache/cache-info-decoding'
import { workUnitAsyncStorage } from './work-unit-async-storage.external'

/**
 * Server-side CacheInfo with additional fields for accumulation
 * during rendering. Extends the shared CacheInfo with:
 * - `current`: mutable accumulator updated during rendering (inspired by
 *   React refs). Used to derive the final `value` when resolved.
 * - `resolvers`: callbacks waiting for resolution.
 */
export type ServerCacheInfo<T> = CacheInfo<T> & {
  status: 'pending' | 'fulfilled'
  value: T
  current: T
  resolvers: Array<(value: T) => void>
}

/**
 * Creates a pending ServerCacheInfo with the given default value.
 * Flight serializes it lazily into the response stream.
 */
export function createCacheInfo<T>(defaultValue: T): ServerCacheInfo<T> {
  const thenable = {
    status: 'pending' as const,
    value: defaultValue,
    current: defaultValue,
    then(onfulfilled: ((value: T) => unknown) | null | undefined) {
      if (onfulfilled) {
        if (thenable.status === 'pending') {
          thenable.resolvers.push(onfulfilled)
        } else {
          onfulfilled(thenable.value)
        }
      }
    },
    resolvers: [] as Array<(value: T) => void>,
  } as ServerCacheInfo<T>
  return thenable
}

/**
 * Resolves a ServerCacheInfo with its final value.
 */
function resolveCacheInfo<T>(thenable: ServerCacheInfo<T>, value: T): void {
  if (thenable.status !== 'pending') {
    return
  }
  thenable.value = value
  thenable.status = 'fulfilled'
  for (const resolver of thenable.resolvers) {
    resolver(value)
  }
  thenable.resolvers = []
}

/**
 * Resolves the cache stage thenable with its accumulated `current` value,
 * then waits for Flight to flush it into the response stream.
 *
 * Follows the same pattern as `finishStaleTimeTracking` and
 * `finishAccumulatingVaryParams`.
 */
export async function finishCacheStageTracking(
  thenable: ServerCacheInfo<number>
): Promise<void> {
  resolveCacheInfo(thenable, thenable.current)

  // Wait for Flight to flush the resolved value into the response stream.
  // See finishAccumulatingVaryParams for a detailed explanation of why
  // these microtask awaits are necessary.
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * Returns the cache stage accumulator from the current work unit store,
 * cast to the shared CacheInfo type for embedding in the Flight response.
 *
 * Follows the same pattern as `getMetadataVaryParamsThenable`.
 */
export function getCacheStageThenable(): CacheInfo<number> | null {
  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender-runtime':
        return workUnitStore.cacheStageAccumulator as unknown as CacheInfo<number>
      case 'prerender':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'prerender-client':
      case 'validation-client':
      case 'request':
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
      case 'generate-static-params':
        return null
      default:
        workUnitStore satisfies never
    }
  }
  return null
}
