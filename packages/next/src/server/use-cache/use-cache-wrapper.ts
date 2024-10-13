import type { DeepReadonly } from '../../shared/lib/deep-readonly'
/* eslint-disable import/no-extraneous-dependencies */
import {
  renderToReadableStream,
  decodeReply,
  createTemporaryReferenceSet as createServerTemporaryReferenceSet,
} from 'react-server-dom-webpack/server.edge'
/* eslint-disable import/no-extraneous-dependencies */
import {
  createFromReadableStream,
  encodeReply,
  createTemporaryReferenceSet as createClientTemporaryReferenceSet,
} from 'react-server-dom-webpack/client.edge'

import type { WorkStore } from '../app-render/work-async-storage.external'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import type {
  UseCacheStore,
  WorkUnitStore,
} from '../app-render/work-unit-async-storage.external'
import { workUnitAsyncStorage } from '../app-render/work-unit-async-storage.external'
import { runInCleanSnapshot } from '../app-render/clean-async-snapshot.external'

import { cacheScopeAsyncLocalStorage } from '../async-storage/cache-scope.external'

import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

import {
  getClientReferenceManifestSingleton,
  getServerModuleMap,
} from '../app-render/encryption-utils'
import { defaultCacheLife } from './cache-life'
import type { CacheScopeStore } from '../async-storage/cache-scope.external'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

type CacheEntry = {
  value: ReadableStream
  timestamp: number
  // In-memory caches are fragile and should not use stale-while-revalidate
  // semantics on the caches because it's not worth warming up an entry that's
  // likely going to get evicted before we get to use it anyway. However,
  // we also don't want to reuse a stale entry for too long so stale entries
  // should be considered expired/missing in such CacheHandlers.
  revalidate: number
  expire: number
  stale: number
  tags: string[]
}

interface CacheHandler {
  get(cacheKey: string, implicitTags: string[]): Promise<undefined | CacheEntry>
  set(cacheKey: string, value: Promise<CacheEntry>): Promise<void>
}

const cacheHandlerMap: Map<string, CacheHandler> = new Map()

// TODO: Move default implementation to be injectable.
const defaultCacheStorage: Map<string, Promise<CacheEntry>> = new Map()
cacheHandlerMap.set('default', {
  async get(cacheKey: string): Promise<undefined | CacheEntry> {
    // TODO: Implement proper caching.
    const entry = await defaultCacheStorage.get(cacheKey)
    if (entry !== undefined) {
      if (
        performance.timeOrigin + performance.now() >
        entry.timestamp + entry.revalidate * 1000
      ) {
        // In memory caches should expire after revalidate time because it is unlikely that
        // a new entry will be able to be used before it is dropped from the cache.
        return undefined
      }
      const [returnStream, newSaved] = entry.value.tee()
      entry.value = newSaved
      return {
        value: returnStream,
        timestamp: entry.timestamp,
        revalidate: entry.revalidate,
        expire: entry.revalidate,
        stale: entry.stale,
        tags: entry.tags,
      }
    }
    return undefined
  },
  async set(cacheKey: string, promise: Promise<CacheEntry>) {
    // TODO: Implement proper caching.
    defaultCacheStorage.set(cacheKey, promise)
    await promise
  },
})

function generateCacheEntry(
  workStore: WorkStore,
  outerWorkUnitStore: WorkUnitStore | undefined,
  cacheScope: undefined | CacheScopeStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  cacheHandler: CacheHandler,
  serializedCacheKey: string,
  encodedArguments: FormData | string,
  fn: any
): Promise<ReadableStream> {
  // We need to run this inside a clean AsyncLocalStorage snapshot so that the cache
  // generation cannot read anything from the context we're currently executing which
  // might include request specific things like cookies() inside a React.cache().
  // Note: It is important that we await at least once before this because it lets us
  // pop out of any stack specific contexts as well - aka "Sync" Local Storage.
  return runInCleanSnapshot(
    generateCacheEntryWithRestoredWorkStore,
    workStore,
    outerWorkUnitStore,
    cacheScope,
    clientReferenceManifest,
    cacheHandler,
    serializedCacheKey,
    encodedArguments,
    fn
  )
}

function generateCacheEntryWithRestoredWorkStore(
  workStore: WorkStore,
  outerWorkUnitStore: WorkUnitStore | undefined,
  cacheScope: undefined | CacheScopeStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  cacheHandler: CacheHandler,
  serializedCacheKey: string,
  encodedArguments: FormData | string,
  fn: any
) {
  // Since we cleared the AsyncLocalStorage we need to restore the workStore.
  // Note: We explicitly don't restore the RequestStore nor the PrerenderStore.
  // We don't want any request specific information leaking an we don't want to create a
  // bloated fake request mock for every cache call. So any feature that currently lives
  // in RequestStore but should be available to Caches need to move to WorkStore.
  // PrerenderStore is not needed inside the cache scope because the outer most one will
  // be the one to report its result to the outer Prerender.
  if (cacheScope) {
    return cacheScopeAsyncLocalStorage.run(cacheScope, () =>
      workAsyncStorage.run(
        workStore,
        generateCacheEntryWithCacheContext,
        workStore,
        outerWorkUnitStore,
        clientReferenceManifest,
        cacheHandler,
        serializedCacheKey,
        encodedArguments,
        fn
      )
    )
  }
  return workAsyncStorage.run(
    workStore,
    generateCacheEntryWithCacheContext,
    workStore,
    outerWorkUnitStore,
    clientReferenceManifest,
    cacheHandler,
    serializedCacheKey,
    encodedArguments,
    fn
  )
}

function generateCacheEntryWithCacheContext(
  workStore: WorkStore,
  outerWorkUnitStore: WorkUnitStore | undefined,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  cacheHandler: CacheHandler,
  serializedCacheKey: string,
  encodedArguments: FormData | string,
  fn: any
) {
  // Initialize the Store for this Cache entry.
  const cacheStore: UseCacheStore = {
    type: 'cache',
    phase: 'render',
    implicitTags:
      outerWorkUnitStore === undefined ||
      outerWorkUnitStore.type === 'unstable-cache'
        ? []
        : outerWorkUnitStore.implicitTags,
    revalidate: defaultCacheLife.revalidate,
    explicitRevalidate: undefined,
    tags: null,
  }
  return workUnitAsyncStorage.run(
    cacheStore,
    generateCacheEntryImpl,
    workStore,
    outerWorkUnitStore,
    cacheStore,
    clientReferenceManifest,
    cacheHandler,
    serializedCacheKey,
    encodedArguments,
    fn
  )
}

function propagateCacheLifeAndTags(
  workUnitStore: WorkUnitStore | undefined,
  entry: CacheEntry
): void {
  if (
    workUnitStore &&
    (workUnitStore.type === 'cache' ||
      workUnitStore.type === 'prerender' ||
      workUnitStore.type === 'prerender-ppr' ||
      workUnitStore.type === 'prerender-legacy')
  ) {
    // Propagate tags and revalidate upwards
    const outerTags = workUnitStore.tags ?? (workUnitStore.tags = [])
    const entryTags = entry.tags
    for (let i = 0; i < entryTags.length; i++) {
      const tag = entryTags[i]
      if (!outerTags.includes(tag)) {
        outerTags.push(tag)
      }
    }
    if (workUnitStore.revalidate > entry.revalidate) {
      workUnitStore.revalidate = entry.revalidate
    }
  }
}

async function collectResult(
  savedStream: ReadableStream,
  outerWorkUnitStore: WorkUnitStore | undefined,
  innerCacheStore: UseCacheStore,
  startTime: number,
  errors: Array<unknown> // This is a live array that gets pushed into.
): Promise<CacheEntry> {
  // We create a buffered stream that collects all chunks until the end to
  // ensure that RSC has finished rendering and therefore we have collected
  // all tags. In the future the RSC API might allow for the equivalent of
  // the allReady Promise that exists on SSR streams.
  //
  // If something errored or rejected anywhere in the render, we close
  // the stream as errored. This lets a CacheHandler choose to save the
  // partial result up until that point for future hits for a while to avoid
  // unnecessary retries or not to retry. We use the end of the stream for
  // this to avoid another complicated side-channel. A receiver has to consider
  // that the stream might also error for other reasons anyway such as losing
  // connection.

  const buffer: any[] = []
  const reader = savedStream.getReader()
  for (let entry; !(entry = await reader.read()).done; ) {
    buffer.push(entry.value)
  }

  let idx = 0
  const bufferStream = new ReadableStream({
    pull(controller) {
      if (idx < buffer.length) {
        controller.enqueue(buffer[idx++])
      } else if (errors.length > 0) {
        // TODO: Should we use AggregateError here?
        controller.error(errors[0])
      } else {
        controller.close()
      }
    },
  })

  const collectedTags = innerCacheStore.tags
  // If cacheLife() was used to set an explicit revalidate time we use that.
  // Otherwise, we use the lowest of all inner fetch()/unstable_cache() or nested "use cache".
  // If they're lower than our default.
  const collectedRevalidate =
    innerCacheStore.explicitRevalidate !== undefined
      ? innerCacheStore.explicitRevalidate
      : innerCacheStore.revalidate

  const entry = {
    value: bufferStream,
    timestamp: startTime,
    revalidate: collectedRevalidate,
    expire: Infinity,
    stale: 0,
    tags: collectedTags === null ? [] : collectedTags,
  }
  // Propagate tags/revalidate to the parent context.
  propagateCacheLifeAndTags(outerWorkUnitStore, entry)

  const cacheSignal =
    outerWorkUnitStore && outerWorkUnitStore.type === 'prerender'
      ? outerWorkUnitStore.cacheSignal
      : null
  if (cacheSignal) {
    cacheSignal.endRead()
  }

  return entry
}

async function generateCacheEntryImpl(
  workStore: WorkStore,
  outerWorkUnitStore: WorkUnitStore | undefined,
  innerCacheStore: UseCacheStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  cacheHandler: CacheHandler,
  serializedCacheKey: string,
  encodedArguments: FormData | string,
  fn: any
): Promise<ReadableStream> {
  const temporaryReferences = createServerTemporaryReferenceSet()

  const [, , args] = await decodeReply<any[]>(
    encodedArguments,
    getServerModuleMap(),
    {
      temporaryReferences,
    }
  )

  // Track the timestamp when we started copmuting the result.
  const startTime = performance.timeOrigin + performance.now()
  // Invoke the inner function to load a new result.
  const result = fn.apply(null, args)

  let errors: Array<unknown> = []

  const stream = renderToReadableStream(
    result,
    clientReferenceManifest.clientModules,
    {
      environmentName: 'Cache',
      temporaryReferences,
      onError(error: unknown) {
        // Report the error.
        console.error(error)
        errors.push(error)
      },
    }
  )

  const [returnStream, savedStream] = stream.tee()

  let cacheEntry = collectResult(
    savedStream,
    outerWorkUnitStore,
    innerCacheStore,
    startTime,
    errors
  )

  if (!workStore.pendingRevalidateWrites) {
    workStore.pendingRevalidateWrites = []
  }

  const promise = cacheHandler.set(serializedCacheKey, cacheEntry)

  workStore.pendingRevalidateWrites.push(promise)

  // Return the stream as we're creating it. This means that if it ends up
  // erroring we cannot return a stale-while-error version but it allows
  // streaming back the result earlier.
  return returnStream
}

async function loadCacheEntry(
  workStore: WorkStore,
  workUnitStore: WorkUnitStore | undefined,
  cacheScope: undefined | CacheScopeStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  cacheHandler: CacheHandler,
  serializedCacheKey: string,
  encodedArguments: FormData | string,
  fn: any
): Promise<ReadableStream> {
  const cacheSignal =
    workUnitStore && workUnitStore.type === 'prerender'
      ? workUnitStore.cacheSignal
      : null
  if (cacheSignal) {
    // Either the cache handler or the generation can be using I/O at this point.
    // We need to track when they start and when they complete.
    cacheSignal.beginRead()
  }

  const implicitTags =
    workUnitStore === undefined || workUnitStore.type === 'unstable-cache'
      ? []
      : workUnitStore.implicitTags
  let entry: undefined | CacheEntry = await cacheHandler.get(
    serializedCacheKey,
    implicitTags
  )

  const currentTime = performance.timeOrigin + performance.now()
  if (
    entry === undefined ||
    currentTime > entry.timestamp + entry.expire * 1000 ||
    (workStore.isStaticGeneration &&
      currentTime > entry.timestamp + entry.revalidate * 1000)
  ) {
    // Miss. Generate a new result.

    // If the cache entry is stale and we're prerendering, we don't want to use the
    // stale entry since it would unnecessarily need to shorten the lifetime of the
    // prerender. We're not time constrained here so we can re-generated it now.

    // We need to run this inside a clean AsyncLocalStorage snapshot so that the cache
    // generation cannot read anything from the context we're currently executing which
    // might include request specific things like cookies() inside a React.cache().
    // Note: It is important that we await at least once before this because it lets us
    // pop out of any stack specific contexts as well - aka "Sync" Local Storage.

    return generateCacheEntry(
      workStore,
      workUnitStore,
      cacheScope,
      clientReferenceManifest,
      cacheHandler,
      serializedCacheKey,
      encodedArguments,
      fn
    )
  } else {
    propagateCacheLifeAndTags(workUnitStore, entry)

    if (currentTime > entry.timestamp + entry.revalidate) {
      // If this is stale, and we're not in a prerender (i.e. this is dynamic render),
      // then we should warm up the cache with a fresh revalidated entry.
      const ignoredStream = await generateCacheEntry(
        workStore,
        workUnitStore,
        cacheScope,
        clientReferenceManifest,
        cacheHandler,
        serializedCacheKey,
        encodedArguments,
        fn
      )
      await ignoredStream.cancel()
    } else {
      if (cacheSignal) {
        // If we're not regenerating we need to signal that we've finished
        // putting the entry into the cache scope at this point. Otherwise we do
        // that inside generateCacheEntry.
        cacheSignal.endRead()
      }
    }

    return entry.value
  }
}

async function teePromiseOfStream(
  promiseOfStream: Promise<ReadableStream>
): Promise<[ReadableStream, ReadableStream]> {
  return (await promiseOfStream).tee()
}

async function cacheScopeEntryFromSecondStream(
  promiseOfStreams: Promise<[ReadableStream, ReadableStream]>
) {
  return { value: (await promiseOfStreams)[1] }
}

export function cache(kind: string, id: string, fn: any) {
  if (!process.env.__NEXT_DYNAMIC_IO) {
    throw new Error(
      '"use cache" is only available with the experimental.dynamicIO config.'
    )
  }
  const cacheHandler = cacheHandlerMap.get(kind)
  if (cacheHandler === undefined) {
    throw new Error('Unknown cache handler: ' + kind)
  }
  const name = fn.name
  const cachedFn = {
    [name]: async function (...args: any[]) {
      const workStore = workAsyncStorage.getStore()
      if (workStore === undefined) {
        throw new Error(
          '"use cache" cannot be used outside of App Router. Expected a WorkStore.'
        )
      }

      const workUnitStore = workUnitAsyncStorage.getStore()

      // Get the clientReferenceManifestSingleton while we're still in the outer Context.
      // In case getClientReferenceManifestSingleton is implemented using AsyncLocalStorage.
      const clientReferenceManifestSingleton =
        getClientReferenceManifestSingleton()

      // Because the Action ID is not yet unique per implementation of that Action we can't
      // safely reuse the results across builds yet. In the meantime we add the buildId to the
      // arguments as a seed to ensure they're not reused. Remove this once Action IDs hash
      // the implementation.
      const buildId = workStore.buildId

      const temporaryReferences = createClientTemporaryReferenceSet()
      const encodedArguments: FormData | string = await encodeReply(
        [buildId, id, args],
        {
          temporaryReferences,
        }
      )

      const serializedCacheKey =
        typeof encodedArguments === 'string'
          ? // Fast path for the simple case for simple inputs. We let the CacheHandler
            // Convert it to an ArrayBuffer if it wants to.
            encodedArguments
          : // The FormData might contain binary data that is not valid UTF-8 so this cache
            // key may generate a UCS-2 string. Passing this to another service needs to be
            // aware that the key might not be compatible.
            String.fromCodePoint(
              ...new Uint8Array(
                await new Response(encodedArguments).arrayBuffer()
              )
            )

      let stream: ReadableStream

      const cacheScope: undefined | CacheScopeStore =
        cacheScopeAsyncLocalStorage.getStore()
      if (cacheScope) {
        // String cache key for easier hash mapping.
        // Note that we're not worried about collisions between string and base64
        // since the string form will always be JSON which doesn't overlap with base64.
        const cachedStream:
          | undefined
          | Promise<{
              value: ReadableStream
            }> = cacheScope.cache.get(serializedCacheKey)
        if (cachedStream !== undefined) {
          const entry = await cachedStream
          // Get a clone out of the cache.
          const [streamA, streamB] = entry.value.tee()
          entry.value = streamB
          stream = streamA
        } else {
          // If this is a miss we need to synchronously save an entry so that if we're asked again
          // for the same entry, we can dedupe the requests. So we split the Promise into two Promises
          // of streams.
          const loadedStream = loadCacheEntry(
            workStore,
            workUnitStore,
            cacheScope,
            clientReferenceManifestSingleton,
            cacheHandler,
            serializedCacheKey,
            encodedArguments,
            fn
          )
          const streams = teePromiseOfStream(loadedStream)
          cacheScope.cache.set(
            serializedCacheKey,
            cacheScopeEntryFromSecondStream(streams)
          )
          stream = (await streams)[0]
        }
      } else {
        stream = await loadCacheEntry(
          workStore,
          workUnitStore,
          cacheScope,
          clientReferenceManifestSingleton,
          cacheHandler,
          serializedCacheKey,
          encodedArguments,
          fn
        )
      }

      // Logs are replayed even if it's a hit - to ensure we see them on the client eventually.
      // If we didn't then the client wouldn't see the logs if it was seeded from a prewarm that
      // never made it to the client. However, this also means that you see logs even when the
      // cached function isn't actually re-executed. We should instead ensure prewarms always
      // make it to the client. Another issue is that this will cause double logging in the
      // server terminal. Once while generating the cache entry and once when replaying it on
      // the server, which is required to pick it up for replaying again on the client.
      const replayConsoleLogs = true

      const ssrManifest = {
        // moduleLoading must be null because we don't want to trigger preloads of ClientReferences
        // to be added to the consumer. Instead, we'll wait for any ClientReference to be emitted
        // which themselves will handle the preloading.
        moduleLoading: null,
        moduleMap: isEdgeRuntime
          ? clientReferenceManifestSingleton.edgeRscModuleMapping
          : clientReferenceManifestSingleton.rscModuleMapping,
      }

      return createFromReadableStream(stream, {
        ssrManifest,
        temporaryReferences,
        replayConsoleLogs,
        environmentName: 'Cache',
      })
    },
  }[name]
  return cachedFn
}
