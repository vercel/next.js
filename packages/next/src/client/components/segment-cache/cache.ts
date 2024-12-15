import type {
  TreePrefetch,
  RootTreePrefetch,
  SegmentPrefetch,
} from '../../../server/app-render/collect-segment-data'
import type { LoadingModuleData } from '../../../shared/lib/app-router-context.shared-runtime'
import {
  NEXT_DID_POSTPONE_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
  NEXT_ROUTER_SEGMENT_PREFETCH_HEADER,
  NEXT_URL,
  RSC_CONTENT_TYPE_HEADER,
  RSC_HEADER,
} from '../app-router-headers'
import {
  createFetch,
  createFromNextReadableStream,
  urlToUrlWithoutFlightMarker,
  type RequestHeaders,
} from '../router-reducer/fetch-server-response'
import {
  trackPrefetchRequestBandwidth,
  pingPrefetchTask,
  type PrefetchTask,
  spawnPrefetchSubtask,
} from './scheduler'
import { getAppBuildId } from '../../app-build-id'
import { createHrefFromUrl } from '../router-reducer/create-href-from-url'
import type {
  NormalizedHref,
  NormalizedNextUrl,
  RouteCacheKey,
} from './cache-key'
import { createTupleMap, type TupleMap, type Prefix } from './tuple-map'
import { createLRU, type LRU } from './lru'

// A note on async/await when working in the prefetch cache:
//
// Most async operations in the prefetch cache should *not* use async/await,
// Instead, spawn a subtask that writes the results to a cache entry, and attach
// a "ping" listener to notify the prefetch queue to try again.
//
// The reason is we need to be able to access the segment cache and traverse its
// data structures synchronously. For example, if there's a synchronous update
// we can take an immediate snapshot of the cache to produce something we can
// render. Limiting the use of async/await also makes it easier to avoid race
// conditions, which is especially important because is cache is mutable.
//
// Another reason is that while we're performing async work, it's possible for
// existing entries to become stale, or for Link prefetches to be removed from
// the queue. For optimal scheduling, we need to be able to "cancel" subtasks
// that are no longer needed. So, when a segment is received from the server, we
// restart from the root of the tree that's being prefetched, to confirm all the
// parent segments are still cached. If the segment is no longer reachable from
// the root, then it's effectively canceled. This is similar to the design of
// Rust Futures, or React Suspense.

type RouteCacheEntryShared = {
  staleAt: number
  // This is false only if we're certain the route cannot be intercepted. It's
  // true in all other cases, including on initialization when we haven't yet
  // received a response from the server.
  couldBeIntercepted: boolean

  // LRU-related fields
  keypath: null | Prefix<RouteCacheKeypath>
  next: null | RouteCacheEntry
  prev: null | RouteCacheEntry
  size: number
}

export const enum EntryStatus {
  Pending,
  Rejected,
  Fulfilled,
}

type PendingRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Pending
  blockedTasks: Set<PrefetchTask> | null
  canonicalUrl: null
  tree: null
  head: null
  isHeadPartial: true
}

type RejectedRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Rejected
  blockedTasks: Set<PrefetchTask> | null
  canonicalUrl: null
  tree: null
  head: null
  isHeadPartial: true
}

export type FulfilledRouteCacheEntry = RouteCacheEntryShared & {
  status: EntryStatus.Fulfilled
  blockedTasks: null
  canonicalUrl: string
  tree: TreePrefetch
  head: React.ReactNode | null
  isHeadPartial: boolean
}

export type RouteCacheEntry =
  | PendingRouteCacheEntry
  | FulfilledRouteCacheEntry
  | RejectedRouteCacheEntry

type SegmentCacheEntryShared = {
  staleAt: number

  // LRU-related fields
  key: null | string
  next: null | RouteCacheEntry
  prev: null | RouteCacheEntry
  size: number
}

type PendingSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Pending
  rsc: null
  loading: null
  isPartial: true
  promise: null | PromiseWithResolvers<FulfilledSegmentCacheEntry | null>
}

type RejectedSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Rejected
  rsc: null
  loading: null
  isPartial: true
  promise: null
}

type FulfilledSegmentCacheEntry = SegmentCacheEntryShared & {
  status: EntryStatus.Fulfilled
  rsc: React.ReactNode | null
  loading: LoadingModuleData | Promise<LoadingModuleData>
  isPartial: boolean
  promise: null
}

export type SegmentCacheEntry =
  | PendingSegmentCacheEntry
  | RejectedSegmentCacheEntry
  | FulfilledSegmentCacheEntry

// Route cache entries vary on multiple keys: the href and the Next-Url. Each of
// these parts needs to be included in the internal cache key. Rather than
// concatenate the keys into a single key, we use a multi-level map, where the
// first level is keyed by href, the second level is keyed by Next-Url, and so
// on (if were to add more levels).
type RouteCacheKeypath = [NormalizedHref, NormalizedNextUrl]
const routeCacheMap: TupleMap<RouteCacheKeypath, RouteCacheEntry> =
  createTupleMap()

// We use an LRU for memory management. We must update this whenever we add or
// remove a new cache entry, or when an entry changes size.
// TODO: I chose the max size somewhat arbitrarily. Consider setting this based
// on navigator.deviceMemory, or some other heuristic. We should make this
// customizable via the Next.js config, too.
const maxRouteLruSize = 10 * 1024 * 1024 // 10 MB
const routeCacheLru = createLRU<RouteCacheEntry>(
  maxRouteLruSize,
  onRouteLRUEviction
)

// TODO: We may eventually store segment entries in a tuple map, too, to
// account for search params.
const segmentCacheMap = new Map<string, SegmentCacheEntry>()
// NOTE: Segments and Route entries are managed by separate LRUs. We could
// combine them into a single LRU, but because they are separate types, we'd
// need to wrap each one in an extra LRU node (to maintain monomorphism, at the
// cost of additional memory).
const maxSegmentLruSize = 50 * 1024 * 1024 // 50 MB
const segmentCacheLru = createLRU<SegmentCacheEntry>(
  maxSegmentLruSize,
  onSegmentLRUEviction
)

export function readExactRouteCacheEntry(
  now: number,
  href: NormalizedHref,
  nextUrl: NormalizedNextUrl | null
): RouteCacheEntry | null {
  const keypath: Prefix<RouteCacheKeypath> =
    nextUrl === null ? [href] : [href, nextUrl]
  const existingEntry = routeCacheMap.get(keypath)
  if (existingEntry !== null) {
    // Check if the entry is stale
    if (existingEntry.staleAt > now) {
      // Reuse the existing entry.

      // Since this is an access, move the entry to the front of the LRU.
      routeCacheLru.put(existingEntry)

      return existingEntry
    } else {
      // Evict the stale entry from the cache.
      deleteRouteFromCache(existingEntry, keypath)
    }
  }
  return null
}

export function readRouteCacheEntry(
  now: number,
  key: RouteCacheKey
): RouteCacheEntry | null {
  // First check if there's a non-intercepted entry. Most routes cannot be
  // intercepted, so this is the common case.
  const nonInterceptedEntry = readExactRouteCacheEntry(now, key.href, null)
  if (nonInterceptedEntry !== null && !nonInterceptedEntry.couldBeIntercepted) {
    // Found a match, and the route cannot be intercepted. We can reuse it.
    return nonInterceptedEntry
  }
  // There was no match. Check again but include the Next-Url this time.
  return readExactRouteCacheEntry(now, key.href, key.nextUrl)
}

export function readSegmentCacheEntry(
  now: number,
  path: string
): SegmentCacheEntry | null {
  const existingEntry = segmentCacheMap.get(path)
  if (existingEntry !== undefined) {
    // Check if the entry is stale
    if (existingEntry.staleAt > now) {
      // Reuse the existing entry.

      // Since this is an access, move the entry to the front of the LRU.
      segmentCacheLru.put(existingEntry)

      return existingEntry
    } else {
      // Evict the stale entry from the cache.
      deleteSegmentFromCache(existingEntry, path)
    }
  }
  return null
}

export function waitForSegmentCacheEntry(
  pendingEntry: PendingSegmentCacheEntry
): Promise<FulfilledSegmentCacheEntry | null> {
  // Because the entry is pending, there's already a in-progress request.
  // Attach a promise to the entry that will resolve when the server responds.
  let promiseWithResolvers = pendingEntry.promise
  if (promiseWithResolvers === null) {
    promiseWithResolvers = pendingEntry.promise =
      createPromiseWithResolvers<FulfilledSegmentCacheEntry | null>()
  } else {
    // There's already a promise we can use
  }
  return promiseWithResolvers.promise
}

/**
 * Reads the route cache for a matching entry *and* spawns a request if there's
 * no match. Because this may issue a network request, it should only be called
 * from within the context of a prefetch task.
 */
export function requestRouteCacheEntryFromCache(
  now: number,
  task: PrefetchTask
): RouteCacheEntry {
  const key = task.key
  // First check if there's a non-intercepted entry. Most routes cannot be
  // intercepted, so this is the common case.
  const nonInterceptedEntry = readExactRouteCacheEntry(now, key.href, null)
  if (nonInterceptedEntry !== null && !nonInterceptedEntry.couldBeIntercepted) {
    // Found a match, and the route cannot be intercepted. We can reuse it.
    return nonInterceptedEntry
  }
  // There was no match. Check again but include the Next-Url this time.
  const exactEntry = readExactRouteCacheEntry(now, key.href, key.nextUrl)
  if (exactEntry !== null) {
    return exactEntry
  }
  // Create a pending entry and spawn a request for its data.
  const pendingEntry: PendingRouteCacheEntry = {
    canonicalUrl: null,
    status: EntryStatus.Pending,
    blockedTasks: null,
    tree: null,
    head: null,
    isHeadPartial: true,
    // If the request takes longer than a minute, a subsequent request should
    // retry instead of waiting for this one.
    //
    // When the response is received, this value will be replaced by a new value
    // based on the stale time sent from the server.
    staleAt: now + 60 * 1000,
    // This is initialized to true because we don't know yet whether the route
    // could be intercepted. It's only set to false once we receive a response
    // from the server.
    couldBeIntercepted: true,

    // LRU-related fields
    keypath: null,
    next: null,
    prev: null,
    size: 0,
  }
  spawnPrefetchSubtask(fetchRouteOnCacheMiss(pendingEntry, task))
  const keypath: Prefix<RouteCacheKeypath> =
    key.nextUrl === null ? [key.href] : [key.href, key.nextUrl]
  routeCacheMap.set(keypath, pendingEntry)
  // Stash the keypath on the entry so we know how to remove it from the map
  // if it gets evicted from the LRU.
  pendingEntry.keypath = keypath
  routeCacheLru.put(pendingEntry)
  return pendingEntry
}

/**
 * Reads the route cache for a matching entry *and* spawns a request if there's
 * no match. Because this may issue a network request, it should only be called
 * from within the context of a prefetch task.
 */
export function requestSegmentEntryFromCache(
  now: number,
  task: PrefetchTask,
  route: FulfilledRouteCacheEntry,
  path: string,
  accessToken: string
): SegmentCacheEntry {
  const existingEntry = readSegmentCacheEntry(now, path)
  if (existingEntry !== null) {
    return existingEntry
  }
  // Create a pending entry and spawn a request for its data.
  const pendingEntry: PendingSegmentCacheEntry = {
    status: EntryStatus.Pending,
    rsc: null,
    loading: null,
    staleAt: route.staleAt,
    isPartial: true,
    promise: null,

    // LRU-related fields
    key: null,
    next: null,
    prev: null,
    size: 0,
  }
  spawnPrefetchSubtask(
    fetchSegmentEntryOnCacheMiss(
      route,
      pendingEntry,
      task.key,
      path,
      accessToken
    )
  )
  segmentCacheMap.set(path, pendingEntry)
  // Stash the keypath on the entry so we know how to remove it from the map
  // if it gets evicted from the LRU.
  pendingEntry.key = path
  segmentCacheLru.put(pendingEntry)
  return pendingEntry
}

function deleteRouteFromCache(
  entry: RouteCacheEntry,
  keypath: Prefix<RouteCacheKeypath>
): void {
  pingBlockedTasks(entry)
  routeCacheMap.delete(keypath)
  routeCacheLru.delete(entry)
}

function deleteSegmentFromCache(entry: SegmentCacheEntry, key: string): void {
  cancelEntryListeners(entry)
  segmentCacheMap.delete(key)
  segmentCacheLru.delete(entry)
}

function onRouteLRUEviction(entry: RouteCacheEntry): void {
  // The LRU evicted this entry. Remove it from the map.
  const keypath = entry.keypath
  if (keypath !== null) {
    entry.keypath = null
    pingBlockedTasks(entry)
    routeCacheMap.delete(keypath)
  }
}

function onSegmentLRUEviction(entry: SegmentCacheEntry): void {
  // The LRU evicted this entry. Remove it from the map.
  const key = entry.key
  if (key !== null) {
    entry.key = null
    cancelEntryListeners(entry)
    segmentCacheMap.delete(key)
  }
}

function cancelEntryListeners(entry: SegmentCacheEntry): void {
  if (entry.status === EntryStatus.Pending && entry.promise !== null) {
    // There were listeners for this entry. Resolve them with `null` to indicate
    // that the prefetch failed. It's up to the listener to decide how to handle
    // this case.
    // NOTE: We don't currently propagate the reason the prefetch was canceled
    // but we could by accepting a `reason` argument.
    entry.promise.resolve(null)
    entry.promise = null
  }
}

function pingBlockedTasks(entry: {
  blockedTasks: Set<PrefetchTask> | null
}): void {
  const blockedTasks = entry.blockedTasks
  if (blockedTasks !== null) {
    for (const task of blockedTasks) {
      pingPrefetchTask(task)
    }
    entry.blockedTasks = null
  }
}

function fulfillRouteCacheEntry(
  entry: PendingRouteCacheEntry,
  tree: TreePrefetch,
  head: React.ReactNode,
  isHeadPartial: boolean,
  staleAt: number,
  couldBeIntercepted: boolean,
  canonicalUrl: string
): FulfilledRouteCacheEntry {
  const fulfilledEntry: FulfilledRouteCacheEntry = entry as any
  fulfilledEntry.status = EntryStatus.Fulfilled
  fulfilledEntry.tree = tree
  fulfilledEntry.head = head
  fulfilledEntry.isHeadPartial = isHeadPartial
  fulfilledEntry.staleAt = staleAt
  fulfilledEntry.couldBeIntercepted = couldBeIntercepted
  fulfilledEntry.canonicalUrl = canonicalUrl
  pingBlockedTasks(entry)
  return fulfilledEntry
}

function fulfillSegmentCacheEntry(
  segmentCacheEntry: PendingSegmentCacheEntry,
  rsc: React.ReactNode,
  loading: LoadingModuleData | Promise<LoadingModuleData>,
  staleAt: number,
  isPartial: boolean
) {
  const fulfilledEntry: FulfilledSegmentCacheEntry = segmentCacheEntry as any
  fulfilledEntry.status = EntryStatus.Fulfilled
  fulfilledEntry.rsc = rsc
  fulfilledEntry.loading = loading
  fulfilledEntry.staleAt = staleAt
  fulfilledEntry.isPartial = isPartial
  // Resolve any listeners that were waiting for this data.
  if (segmentCacheEntry.promise !== null) {
    segmentCacheEntry.promise.resolve(fulfilledEntry)
    // Free the promise for garbage collection.
    fulfilledEntry.promise = null
  }
}

function rejectRouteCacheEntry(
  entry: PendingRouteCacheEntry,
  staleAt: number
): void {
  const rejectedEntry: RejectedRouteCacheEntry = entry as any
  rejectedEntry.status = EntryStatus.Rejected
  rejectedEntry.staleAt = staleAt
  pingBlockedTasks(entry)
}

function rejectSegmentCacheEntry(
  entry: PendingSegmentCacheEntry,
  staleAt: number
): void {
  const rejectedEntry: RejectedSegmentCacheEntry = entry as any
  rejectedEntry.status = EntryStatus.Rejected
  rejectedEntry.staleAt = staleAt
  if (entry.promise !== null) {
    // NOTE: We don't currently propagate the reason the prefetch was canceled
    // but we could by accepting a `reason` argument.
    entry.promise.resolve(null)
    entry.promise = null
  }
}

async function fetchRouteOnCacheMiss(
  entry: PendingRouteCacheEntry,
  task: PrefetchTask
): Promise<void> {
  // This function is allowed to use async/await because it contains the actual
  // fetch that gets issued on a cache miss. Notice though that it does not
  // return anything; it writes the result to the cache entry directly, then
  // pings the scheduler to unblock the corresponding prefetch task.
  const key = task.key
  const href = key.href
  const nextUrl = key.nextUrl
  try {
    const response = await fetchSegmentPrefetchResponse(href, '/_tree', nextUrl)
    if (
      !response ||
      !response.ok ||
      // 204 is a Cache miss. Though theoretically this shouldn't happen when
      // PPR is enabled, because we always respond to route tree requests, even
      // if it needs to be blockingly generated on demand.
      response.status === 204 ||
      // This checks whether the response was served from the per-segment cache,
      // rather than the old prefetching flow. If it fails, it implies that PPR
      // is disabled on this route.
      // TODO: Add support for non-PPR routes.
      response.headers.get(NEXT_DID_POSTPONE_HEADER) !== '2' ||
      !response.body
    ) {
      // Server responded with an error, or with a miss. We should still cache
      // the response, but we can try again after 10 seconds.
      rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
      return
    }
    const prefetchStream = createPrefetchResponseStream(
      response.body,
      routeCacheLru,
      entry
    )
    const serverData: RootTreePrefetch = await (createFromNextReadableStream(
      prefetchStream
    ) as Promise<RootTreePrefetch>)
    if (serverData.buildId !== getAppBuildId()) {
      // The server build does not match the client. Treat as a 404. During
      // an actual navigation, the router will trigger an MPA navigation.
      // TODO: Consider moving the build ID to a response header so we can check
      // it before decoding the response, and so there's one way of checking
      // across all response types.
      rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
      return
    }

    // This is a bit convoluted but it's taken from router-reducer and
    // fetch-server-response
    const canonicalUrl = response.redirected
      ? createHrefFromUrl(urlToUrlWithoutFlightMarker(response.url))
      : href

    // Check whether the response varies based on the Next-Url header.
    const varyHeader = response.headers.get('vary')
    const couldBeIntercepted =
      varyHeader !== null && varyHeader.includes(NEXT_URL)

    fulfillRouteCacheEntry(
      entry,
      serverData.tree,
      serverData.head,
      serverData.isHeadPartial,
      Date.now() + serverData.staleTime,
      couldBeIntercepted,
      canonicalUrl
    )

    if (!couldBeIntercepted && nextUrl !== null) {
      // This route will never be intercepted. So we can use this entry for all
      // requests to this route, regardless of the Next-Url header. This works
      // because when reading the cache we always check for a valid
      // non-intercepted entry first.
      //
      // Re-key the entry. Since we're in an async task, we must first confirm
      // that the entry hasn't been concurrently modified by a different task.
      const currentKeypath: Prefix<RouteCacheKeypath> = [href, nextUrl]
      const expectedEntry = routeCacheMap.get(currentKeypath)
      if (expectedEntry === entry) {
        routeCacheMap.delete(currentKeypath)
        const newKeypath: Prefix<RouteCacheKeypath> = [href]
        routeCacheMap.set(newKeypath, entry)
        // We don't need to update the LRU because the entry is already in it.
        // But since we changed the keypath, we do need to update that, so we
        // know how to remove it from the map if it gets evicted from the LRU.
        entry.keypath = newKeypath
      } else {
        // Something else modified this entry already. Since the re-keying is
        // just a performance optimization, we can safely skip it.
      }
    }
  } catch (error) {
    // Either the connection itself failed, or something bad happened while
    // decoding the response.
    rejectRouteCacheEntry(entry, Date.now() + 10 * 1000)
  }
}

async function fetchSegmentEntryOnCacheMiss(
  route: FulfilledRouteCacheEntry,
  segmentCacheEntry: PendingSegmentCacheEntry,
  routeKey: RouteCacheKey,
  segmentPath: string,
  accessToken: string | null
): Promise<void> {
  // This function is allowed to use async/await because it contains the actual
  // fetch that gets issued on a cache miss. Notice though that it does not
  // return anything; it writes the result to the cache entry directly.
  //
  // Segment fetches are non-blocking so we don't need to ping the scheduler
  // on completion.
  const href = routeKey.href
  try {
    const response = await fetchSegmentPrefetchResponse(
      href,
      accessToken === '' ? segmentPath : `${segmentPath}.${accessToken}`,
      routeKey.nextUrl
    )
    if (
      !response ||
      !response.ok ||
      response.status === 204 || // Cache miss
      // This checks whether the response was served from the per-segment cache,
      // rather than the old prefetching flow. If it fails, it implies that PPR
      // is disabled on this route. Theoretically this should never happen
      // because we only issue requests for segments once we've verified that
      // the route supports PPR.
      response.headers.get(NEXT_DID_POSTPONE_HEADER) !== '2' ||
      !response.body
    ) {
      // Server responded with an error, or with a miss. We should still cache
      // the response, but we can try again after 10 seconds.
      rejectSegmentCacheEntry(segmentCacheEntry, Date.now() + 10 * 1000)
      return
    }
    // Wrap the original stream in a new stream that never closes. That way the
    // Flight client doesn't error if there's a hanging promise.
    const prefetchStream = createPrefetchResponseStream(
      response.body,
      segmentCacheLru,
      segmentCacheEntry
    )
    const serverData = await (createFromNextReadableStream(
      prefetchStream
    ) as Promise<SegmentPrefetch>)
    if (serverData.buildId !== getAppBuildId()) {
      // The server build does not match the client. Treat as a 404. During
      // an actual navigation, the router will trigger an MPA navigation.
      // TODO: Consider moving the build ID to a response header so we can check
      // it before decoding the response, and so there's one way of checking
      // across all response types.
      rejectSegmentCacheEntry(segmentCacheEntry, Date.now() + 10 * 1000)
      return
    }
    fulfillSegmentCacheEntry(
      segmentCacheEntry,
      serverData.rsc,
      serverData.loading,
      // TODO: The server does not currently provide per-segment stale time.
      // So we use the stale time of the route.
      route.staleAt,
      serverData.isPartial
    )
  } catch (error) {
    // Either the connection itself failed, or something bad happened while
    // decoding the response.
    rejectSegmentCacheEntry(segmentCacheEntry, Date.now() + 10 * 1000)
  }
}

async function fetchSegmentPrefetchResponse(
  href: NormalizedHref,
  segmentPath: string,
  nextUrl: NormalizedNextUrl | null
): Promise<Response | null> {
  const headers: RequestHeaders = {
    [RSC_HEADER]: '1',
    [NEXT_ROUTER_PREFETCH_HEADER]: '1',
    [NEXT_ROUTER_SEGMENT_PREFETCH_HEADER]: segmentPath,
  }
  if (nextUrl !== null) {
    headers[NEXT_URL] = nextUrl
  }
  const fetchPriority = 'low'
  const responsePromise = createFetch(new URL(href), headers, fetchPriority)
  trackPrefetchRequestBandwidth(responsePromise)
  const response = await responsePromise
  const contentType = response.headers.get('content-type')
  const isFlightResponse =
    contentType && contentType.startsWith(RSC_CONTENT_TYPE_HEADER)
  if (!response.ok || !isFlightResponse) {
    return null
  }
  return response
}

function createPrefetchResponseStream<
  T extends RouteCacheEntry | SegmentCacheEntry,
>(
  originalFlightStream: ReadableStream<Uint8Array>,
  lru: LRU<T>,
  lruEntry: T
): ReadableStream<Uint8Array> {
  // When PPR is enabled, prefetch streams may contain references that never
  // resolve, because that's how we encode dynamic data access. In the decoded
  // object returned by the Flight client, these are reified into hanging
  // promises that suspend during render, which is effectively what we want.
  // The UI resolves when it switches to the dynamic data stream
  // (via useDeferredValue(dynamic, static)).
  //
  // However, the Flight implementation currently errors if the server closes
  // the response before all the references are resolved. As a cheat to work
  // around this, we wrap the original stream in a new stream that never closes,
  // and therefore doesn't error.
  //
  // While processing the original stream, we also incrementally update the size
  // of the cache entry in the LRU.
  let totalByteLength = 0
  const reader = originalFlightStream.getReader()
  return new ReadableStream({
    async pull(controller) {
      while (true) {
        const { done, value } = await reader.read()
        if (!done) {
          // Pass to the target stream and keep consuming the Flight response
          // from the server.
          controller.enqueue(value)

          // Incrementally update the size of the cache entry in the LRU.
          // NOTE: Since prefetch responses are delivered in a single chunk,
          // it's not really necessary to do this streamingly, but I'm doing it
          // anyway in case this changes in the future.
          totalByteLength += value.byteLength
          lru.updateSize(lruEntry, totalByteLength)

          continue
        }
        // The server stream has closed. Exit, but intentionally do not close
        // the target stream.
        return
      }
    },
  })
}

function createPromiseWithResolvers<T>(): PromiseWithResolvers<T> {
  // Shim of Stage 4 Promise.withResolvers proposal
  let resolve: (value: T | PromiseLike<T>) => void
  let reject: (reason: any) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { resolve: resolve!, reject: reject!, promise }
}
