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
import {
  getRenderResumeDataCache,
  getPrerenderResumeDataCache,
  workUnitAsyncStorage,
} from '../app-render/work-unit-async-storage.external'
import { runInCleanSnapshot } from '../app-render/clean-async-snapshot.external'

import { makeHangingPromise } from '../dynamic-rendering-utils'

import type { ClientReferenceManifestForRsc } from '../../build/webpack/plugins/flight-manifest-plugin'

import {
  getClientReferenceManifestForRsc,
  getServerModuleMap,
} from '../app-render/encryption-utils'
import DefaultCacheHandler from '../lib/cache-handlers/default'
import type { CacheHandler, CacheEntry } from '../lib/cache-handlers/types'
import type { CacheSignal } from '../app-render/cache-signal'
import { decryptActionBoundArgs } from '../app-render/encryption'
import { InvariantError } from '../../shared/lib/invariant-error'
import { getDigestForWellKnownError } from '../app-render/create-error-handler'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

// If the expire time is less than .
const DYNAMIC_EXPIRE = 300

const cacheHandlersSymbol = Symbol.for('@next/cache-handlers')
const _globalThis: typeof globalThis & {
  [cacheHandlersSymbol]?: {
    RemoteCache?: CacheHandler
    DefaultCache?: CacheHandler
  }
  __nextCacheHandlers?: Record<string, CacheHandler>
} = globalThis

const cacheHandlerMap: Map<string, CacheHandler> = new Map([
  [
    'default',
    _globalThis[cacheHandlersSymbol]?.DefaultCache || DefaultCacheHandler,
  ],
  [
    'remote',
    // in dev remote maps to default handler
    // and is meant to be overridden in prod
    _globalThis[cacheHandlersSymbol]?.RemoteCache || DefaultCacheHandler,
  ],
])

function generateCacheEntry(
  workStore: WorkStore,
  outerWorkUnitStore: WorkUnitStore | undefined,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifestForRsc>,
  encodedArguments: FormData | string,
  fn: any
): Promise<[ReadableStream, Promise<CacheEntry>]> {
  // We need to run this inside a clean AsyncLocalStorage snapshot so that the cache
  // generation cannot read anything from the context we're currently executing which
  // might include request specific things like cookies() inside a React.cache().
  // Note: It is important that we await at least once before this because it lets us
  // pop out of any stack specific contexts as well - aka "Sync" Local Storage.
  return runInCleanSnapshot(
    generateCacheEntryWithRestoredWorkStore,
    workStore,
    outerWorkUnitStore,
    clientReferenceManifest,
    encodedArguments,
    fn
  )
}

function generateCacheEntryWithRestoredWorkStore(
  workStore: WorkStore,
  outerWorkUnitStore: WorkUnitStore | undefined,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifestForRsc>,
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
  return workAsyncStorage.run(
    workStore,
    generateCacheEntryWithCacheContext,
    workStore,
    outerWorkUnitStore,
    clientReferenceManifest,
    encodedArguments,
    fn
  )
}

function generateCacheEntryWithCacheContext(
  workStore: WorkStore,
  outerWorkUnitStore: WorkUnitStore | undefined,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifestForRsc>,
  encodedArguments: FormData | string,
  fn: any
) {
  if (!workStore.cacheLifeProfiles) {
    throw new Error(
      'cacheLifeProfiles should always be provided. This is a bug in Next.js.'
    )
  }
  const defaultCacheLife = workStore.cacheLifeProfiles['default']
  if (
    !defaultCacheLife ||
    defaultCacheLife.revalidate == null ||
    defaultCacheLife.expire == null ||
    defaultCacheLife.stale == null
  ) {
    throw new Error(
      'A default cacheLife profile must always be provided. This is a bug in Next.js.'
    )
  }

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
    expire: defaultCacheLife.expire,
    stale: defaultCacheLife.stale,
    explicitRevalidate: undefined,
    explicitExpire: undefined,
    explicitStale: undefined,
    tags: null,
  }
  return workUnitAsyncStorage.run(
    cacheStore,
    generateCacheEntryImpl,
    workStore,
    outerWorkUnitStore,
    cacheStore,
    clientReferenceManifest,
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
    if (workUnitStore.stale > entry.stale) {
      workUnitStore.stale = entry.stale
    }
    if (workUnitStore.revalidate > entry.revalidate) {
      workUnitStore.revalidate = entry.revalidate
    }
    if (workUnitStore.expire > entry.expire) {
      workUnitStore.expire = entry.expire
    }
  }
}

async function collectResult(
  savedStream: ReadableStream,
  outerWorkUnitStore: WorkUnitStore | undefined,
  innerCacheStore: UseCacheStore,
  startTime: number,
  errors: Array<unknown>, // This is a live array that gets pushed into.,
  timer: any
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
  const collectedExpire =
    innerCacheStore.explicitExpire !== undefined
      ? innerCacheStore.explicitExpire
      : innerCacheStore.expire
  const collectedStale =
    innerCacheStore.explicitStale !== undefined
      ? innerCacheStore.explicitStale
      : innerCacheStore.stale

  const entry = {
    value: bufferStream,
    timestamp: startTime,
    revalidate: collectedRevalidate,
    expire: collectedExpire,
    stale: collectedStale,
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

  if (timer !== undefined) {
    clearTimeout(timer)
  }

  return entry
}

async function generateCacheEntryImpl(
  workStore: WorkStore,
  outerWorkUnitStore: WorkUnitStore | undefined,
  innerCacheStore: UseCacheStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifestForRsc>,
  encodedArguments: FormData | string,
  fn: any
): Promise<[ReadableStream, Promise<CacheEntry>]> {
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

  let timer = undefined
  const controller = new AbortController()
  if (workStore.isStaticGeneration) {
    // If we're prerendering, we give you 50 seconds to fill a cache entry. Otherwise
    // we assume you stalled on hanging input and deopt. This needs to be lower than
    // just the general timeout of 60 seconds.
    timer = setTimeout(() => {
      controller.abort(
        new Error(
          'Filling a cache during prerender timed out, likely because request-specific arguments such as ' +
            'params, searchParams, cookies() or dynamic data were used inside "use cache".'
        )
      )
    }, 50000)
  }

  const stream = renderToReadableStream(
    result,
    clientReferenceManifest.clientModules,
    {
      environmentName: 'Cache',
      signal: controller.signal,
      temporaryReferences,
      // In the "Cache" environment, we only need to make sure that the error
      // digests are handled correctly. Error formatting and reporting is not
      // necessary here; the errors are encoded in the stream, and will be
      // reported in the "Server" environment.
      onError: (error) => {
        const digest = getDigestForWellKnownError(error)

        if (digest) {
          return digest
        }

        // TODO: For now we're also reporting the error here, because in
        // production, the "Server" environment will only get the obfuscated
        // error (created by the Flight Client in the cache wrapper).
        console.error(error)
        errors.push(error)
      },
    }
  )

  const [returnStream, savedStream] = stream.tee()

  const promiseOfCacheEntry = collectResult(
    savedStream,
    outerWorkUnitStore,
    innerCacheStore,
    startTime,
    errors,
    timer
  )

  // Return the stream as we're creating it. This means that if it ends up
  // erroring we cannot return a stale-while-error version but it allows
  // streaming back the result earlier.
  return [returnStream, promiseOfCacheEntry]
}

function cloneCacheEntry(entry: CacheEntry): [CacheEntry, CacheEntry] {
  const [streamA, streamB] = entry.value.tee()
  entry.value = streamA
  const clonedEntry: CacheEntry = {
    value: streamB,
    timestamp: entry.timestamp,
    revalidate: entry.revalidate,
    expire: entry.expire,
    stale: entry.stale,
    tags: entry.tags,
  }
  return [entry, clonedEntry]
}

async function clonePendingCacheEntry(
  pendingCacheEntry: Promise<CacheEntry>
): Promise<[CacheEntry, CacheEntry]> {
  const entry = await pendingCacheEntry
  return cloneCacheEntry(entry)
}

async function getNthCacheEntry(
  split: Promise<[CacheEntry, CacheEntry]>,
  i: number
): Promise<CacheEntry> {
  return (await split)[i]
}

async function encodeFormData(formData: FormData): Promise<string> {
  let result = ''
  for (let [key, value] of formData) {
    // We don't need this key to be serializable but from a security perspective it should not be
    // possible to generate a string that looks the same from a different structure. To ensure this
    // we need a delimeter between fields but just using a delimeter is not enough since a string
    // might contain that delimeter. We use the length of each field as the delimeter to avoid
    // escaping the values.
    result += key.length.toString(16) + ':' + key
    let stringValue
    if (typeof value === 'string') {
      stringValue = value
    } else {
      // The FormData might contain binary data that is not valid UTF-8 so this cache
      // key may generate a UCS-2 string. Passing this to another service needs to be
      // aware that the key might not be compatible.
      const arrayBuffer = await value.arrayBuffer()
      if (arrayBuffer.byteLength % 2 === 0) {
        stringValue = String.fromCodePoint(...new Uint16Array(arrayBuffer))
      } else {
        stringValue =
          String.fromCodePoint(
            ...new Uint16Array(arrayBuffer, 0, (arrayBuffer.byteLength - 1) / 2)
          ) +
          String.fromCodePoint(
            new Uint8Array(arrayBuffer, arrayBuffer.byteLength - 1, 1)[0]
          )
      }
    }
    result += stringValue.length.toString(16) + ':' + stringValue
  }
  return result
}

function createTrackedReadableStream(
  stream: ReadableStream,
  cacheSignal: CacheSignal
) {
  const reader = stream.getReader()
  return new ReadableStream({
    async pull(controller) {
      const { done, value } = await reader.read()
      if (done) {
        controller.close()
        cacheSignal.endRead()
      } else {
        controller.enqueue(value)
      }
    },
  })
}

export function cache(
  kind: string,
  id: string,
  boundArgsLength: number,
  fn: any
) {
  for (const [key, value] of Object.entries(
    _globalThis.__nextCacheHandlers || {}
  )) {
    cacheHandlerMap.set(key, value as CacheHandler)
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

      // Get the clientReferenceManifest while we're still in the outer Context.
      // In case getClientReferenceManifestSingleton is implemented using AsyncLocalStorage.
      const clientReferenceManifest = getClientReferenceManifestForRsc()

      // Because the Action ID is not yet unique per implementation of that Action we can't
      // safely reuse the results across builds yet. In the meantime we add the buildId to the
      // arguments as a seed to ensure they're not reused. Remove this once Action IDs hash
      // the implementation.
      const buildId = workStore.buildId

      let abortHangingInputSignal: null | AbortSignal = null
      if (workUnitStore && workUnitStore.type === 'prerender') {
        // In a prerender, we may end up with hanging Promises as inputs due them stalling
        // on connection() or because they're loading dynamic data. In that case we need to
        // abort the encoding of the arguments since they'll never complete.
        const controller = new AbortController()
        abortHangingInputSignal = controller.signal
        if (workUnitStore.cacheSignal) {
          // If we have a cacheSignal it means we're in a prospective render. If the input
          // we're waiting on is coming from another cache, we do want to wait for it so that
          // we can resolve this cache entry too.
          workUnitStore.cacheSignal.inputReady().then(() => {
            controller.abort()
          })
        } else {
          // Otherwise we're in the final render and we should already have all our caches
          // filled. We might still be waiting on some microtasks so we wait one tick before
          // giving up. When we give up, we still want to render the content of this cache
          // as deeply as we can so that we can suspend as deeply as possible in the tree
          // or not at all if we don't end up waiting for the input.
          process.nextTick(() => controller.abort())
        }
      }

      if (boundArgsLength > 0) {
        if (args.length === 0) {
          throw new InvariantError(
            `Expected the "use cache" function ${JSON.stringify(fn.name)} to receive its encrypted bound arguments as the first argument.`
          )
        }

        const encryptedBoundArgs = args.shift()
        const boundArgs = await decryptActionBoundArgs(id, encryptedBoundArgs)

        if (!Array.isArray(boundArgs)) {
          throw new InvariantError(
            `Expected the bound arguments of "use cache" function ${JSON.stringify(fn.name)} to deserialize into an array, got ${typeof boundArgs} instead.`
          )
        }

        if (boundArgsLength !== boundArgs.length) {
          throw new InvariantError(
            `Expected the "use cache" function ${JSON.stringify(fn.name)} to receive ${boundArgsLength} bound arguments, got ${boundArgs.length} instead.`
          )
        }

        args.unshift(boundArgs)
      }

      const temporaryReferences = createClientTemporaryReferenceSet()
      const encodedArguments: FormData | string = await encodeReply(
        [buildId, id, args],
        // Right now this is enough to cause the input to generate hanging Promises
        // but that's really due to what is probably a React bug in decodeReply.
        // If that's fixed we may need a different strategy. We can also just skip
        // the serialization/cache in this scenario and pass-through raw objects.
        abortHangingInputSignal
          ? {
              temporaryReferences,
              signal: abortHangingInputSignal,
            }
          : {
              temporaryReferences,
            }
      )

      const serializedCacheKey =
        typeof encodedArguments === 'string'
          ? // Fast path for the simple case for simple inputs. We let the CacheHandler
            // Convert it to an ArrayBuffer if it wants to.
            encodedArguments
          : await encodeFormData(encodedArguments)

      let stream: undefined | ReadableStream = undefined

      // Get an immutable and mutable versions of the resume data cache.
      const prerenderResumeDataCache = workUnitStore
        ? getPrerenderResumeDataCache(workUnitStore)
        : null
      const renderResumeDataCache = workUnitStore
        ? getRenderResumeDataCache(workUnitStore)
        : null

      if (renderResumeDataCache) {
        const cacheSignal =
          workUnitStore && workUnitStore.type === 'prerender'
            ? workUnitStore.cacheSignal
            : null

        if (cacheSignal) {
          cacheSignal.beginRead()
        }
        const cachedEntry = renderResumeDataCache.cache.get(serializedCacheKey)
        if (cachedEntry !== undefined) {
          const existingEntry = await cachedEntry
          propagateCacheLifeAndTags(workUnitStore, existingEntry)
          if (
            workUnitStore !== undefined &&
            workUnitStore.type === 'prerender' &&
            existingEntry !== undefined &&
            (existingEntry.revalidate === 0 ||
              existingEntry.expire < DYNAMIC_EXPIRE)
          ) {
            // In a Dynamic I/O prerender, if the cache entry has revalidate: 0 or if the
            // expire time is under 5 minutes, then we consider this cache entry dynamic
            // as it's not worth generating static pages for such data. It's better to leave
            // a PPR hole that can be filled in dynamically with a potentially cached entry.
            if (cacheSignal) {
              cacheSignal.endRead()
            }
            return makeHangingPromise(
              workUnitStore.renderSignal,
              'dynamic "use cache"'
            )
          }
          const [streamA, streamB] = existingEntry.value.tee()
          existingEntry.value = streamB

          if (cacheSignal) {
            // When we have a cacheSignal we need to block on reading the cache
            // entry before ending the read.
            stream = createTrackedReadableStream(streamA, cacheSignal)
          } else {
            stream = streamA
          }
        } else {
          if (cacheSignal) {
            cacheSignal.endRead()
          }
        }
      }

      if (stream === undefined) {
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
        const entry: undefined | CacheEntry = await cacheHandler.get(
          serializedCacheKey,
          implicitTags
        )
        const currentTime = performance.timeOrigin + performance.now()
        if (
          workUnitStore !== undefined &&
          workUnitStore.type === 'prerender' &&
          entry !== undefined &&
          (entry.revalidate === 0 || entry.expire < DYNAMIC_EXPIRE)
        ) {
          // In a Dynamic I/O prerender, if the cache entry has revalidate: 0 or if the
          // expire time is under 5 minutes, then we consider this cache entry dynamic
          // as it's not worth generating static pages for such data. It's better to leave
          // a PPR hole that can be filled in dynamically with a potentially cached entry.
          if (cacheSignal) {
            cacheSignal.endRead()
          }

          return makeHangingPromise(
            workUnitStore.renderSignal,
            'dynamic "use cache"'
          )
        } else if (
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

          const [newStream, pendingCacheEntry] = await generateCacheEntry(
            workStore,
            workUnitStore,
            clientReferenceManifest,
            encodedArguments,
            fn
          )

          let savedCacheEntry
          if (prerenderResumeDataCache) {
            // Create a clone that goes into the cache scope memory cache.
            const split = clonePendingCacheEntry(pendingCacheEntry)
            savedCacheEntry = getNthCacheEntry(split, 0)
            prerenderResumeDataCache.cache.set(
              serializedCacheKey,
              getNthCacheEntry(split, 1)
            )
          } else {
            savedCacheEntry = pendingCacheEntry
          }

          const promise = cacheHandler.set(serializedCacheKey, savedCacheEntry)

          if (!workStore.pendingRevalidateWrites) {
            workStore.pendingRevalidateWrites = []
          }
          workStore.pendingRevalidateWrites.push(promise)

          stream = newStream
        } else {
          propagateCacheLifeAndTags(workUnitStore, entry)

          // We want to return this stream, even if it's stale.
          stream = entry.value

          // If we have a cache scope, we need to clone the entry and set it on
          // the inner cache scope.
          if (prerenderResumeDataCache) {
            const [entryLeft, entryRight] = cloneCacheEntry(entry)
            if (cacheSignal) {
              stream = createTrackedReadableStream(entryLeft.value, cacheSignal)
            } else {
              stream = entryLeft.value
            }

            prerenderResumeDataCache.cache.set(
              serializedCacheKey,
              Promise.resolve(entryRight)
            )
          } else {
            // If we're not regenerating we need to signal that we've finished
            // putting the entry into the cache scope at this point. Otherwise we do
            // that inside generateCacheEntry.
            cacheSignal?.endRead()
          }

          if (currentTime > entry.timestamp + entry.revalidate * 1000) {
            // If this is stale, and we're not in a prerender (i.e. this is dynamic render),
            // then we should warm up the cache with a fresh revalidated entry.
            const [ignoredStream, pendingCacheEntry] = await generateCacheEntry(
              workStore,
              undefined, // This is not running within the context of this unit.
              clientReferenceManifest,
              encodedArguments,
              fn
            )

            let savedCacheEntry: Promise<CacheEntry>
            if (prerenderResumeDataCache) {
              const split = clonePendingCacheEntry(pendingCacheEntry)
              savedCacheEntry = getNthCacheEntry(split, 0)
              prerenderResumeDataCache.cache.set(
                serializedCacheKey,
                getNthCacheEntry(split, 1)
              )
            } else {
              savedCacheEntry = pendingCacheEntry
            }

            const promise = cacheHandler.set(
              serializedCacheKey,
              savedCacheEntry
            )

            if (!workStore.pendingRevalidateWrites) {
              workStore.pendingRevalidateWrites = []
            }
            workStore.pendingRevalidateWrites.push(promise)

            await ignoredStream.cancel()
          }
        }
      }

      // Logs are replayed even if it's a hit - to ensure we see them on the client eventually.
      // If we didn't then the client wouldn't see the logs if it was seeded from a prewarm that
      // never made it to the client. However, this also means that you see logs even when the
      // cached function isn't actually re-executed. We should instead ensure prewarms always
      // make it to the client. Another issue is that this will cause double logging in the
      // server terminal. Once while generating the cache entry and once when replaying it on
      // the server, which is required to pick it up for replaying again on the client.
      const replayConsoleLogs = true

      const serverConsumerManifest = {
        // moduleLoading must be null because we don't want to trigger preloads of ClientReferences
        // to be added to the consumer. Instead, we'll wait for any ClientReference to be emitted
        // which themselves will handle the preloading.
        moduleLoading: null,
        moduleMap: isEdgeRuntime
          ? clientReferenceManifest.edgeRscModuleMapping
          : clientReferenceManifest.rscModuleMapping,
        serverModuleMap: getServerModuleMap(),
      }

      return createFromReadableStream(stream, {
        serverConsumerManifest,
        temporaryReferences,
        replayConsoleLogs,
        environmentName: 'Cache',
      })
    },
  }[name]
  return cachedFn
}
