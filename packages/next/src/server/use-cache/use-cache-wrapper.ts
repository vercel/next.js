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

import type { WorkStore } from '../../client/components/work-async-storage.external'
import { workAsyncStorage } from '../../client/components/work-async-storage.external'
import type { UseCacheStore } from '../../client/components/work-unit-async-storage.external'
import { workUnitAsyncStorage } from '../../client/components/work-unit-async-storage.external'
import { runInCleanSnapshot } from '../app-render/clean-async-snapshot.external'

import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

import {
  getClientReferenceManifestSingleton,
  getServerModuleMap,
} from '../app-render/encryption-utils'
import { INFINITE_CACHE } from '../../lib/constants'

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

type CacheEntry = {
  value: ReadableStream
  // In-memory caches are fragile and should not use stale-while-revalidate
  // semantics on the caches because it's not worth warming up an entry that's
  // likely going to get evicted before we get to use it anyway. However,
  // we also don't want to reuse a stale entry for too long so stale entries
  // should be considered expired/missing in such CacheHandlers.
  stale: boolean
}

interface CacheHandler {
  get(cacheKey: string | ArrayBuffer): Promise<undefined | CacheEntry>
  set(cacheKey: string | ArrayBuffer, value: ReadableStream): Promise<void>
}

const cacheHandlerMap: Map<string, CacheHandler> = new Map()

// TODO: Move default implementation to be injectable.
const defaultCacheStorage: Map<string, ReadableStream> = new Map()
cacheHandlerMap.set('default', {
  async get(cacheKey: string | ArrayBuffer) {
    // TODO: Implement proper caching.
    if (typeof cacheKey === 'string') {
      const value = defaultCacheStorage.get(cacheKey)
      if (value !== undefined) {
        const [returnStream, newSaved] = value.tee()
        defaultCacheStorage.set(cacheKey, newSaved)
        return {
          value: returnStream,
          stale: false,
        }
      }
    } else {
      // TODO: Handle binary keys.
    }
    return undefined
  },
  async set(cacheKey: string | ArrayBuffer, value: ReadableStream) {
    // TODO: Implement proper caching.
    if (typeof cacheKey === 'string') {
      defaultCacheStorage.set(cacheKey, value)
    } else {
      // TODO: Handle binary keys.
      await value.cancel()
    }
  },
})

function generateCacheEntry(
  workStore: WorkStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  cacheHandler: CacheHandler,
  serializedCacheKey: string | ArrayBuffer,
  encodedArguments: FormData | string,
  fn: any
): Promise<any> {
  // We need to run this inside a clean AsyncLocalStorage snapshot so that the cache
  // generation cannot read anything from the context we're currently executing which
  // might include request specific things like cookies() inside a React.cache().
  // Note: It is important that we await at least once before this because it lets us
  // pop out of any stack specific contexts as well - aka "Sync" Local Storage.
  return runInCleanSnapshot(
    generateCacheEntryWithRestoredWorkStore,
    workStore,
    clientReferenceManifest,
    cacheHandler,
    serializedCacheKey,
    encodedArguments,
    fn
  )
}

function generateCacheEntryWithRestoredWorkStore(
  workStore: WorkStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  cacheHandler: CacheHandler,
  serializedCacheKey: string | ArrayBuffer,
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
    clientReferenceManifest,
    cacheHandler,
    serializedCacheKey,
    encodedArguments,
    fn
  )
}

function generateCacheEntryWithCacheContext(
  workStore: WorkStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  cacheHandler: CacheHandler,
  serializedCacheKey: string | ArrayBuffer,
  encodedArguments: FormData | string,
  fn: any
) {
  // Initialize the Store for this Cache entry.
  const cacheStore: UseCacheStore = {
    type: 'cache',
    revalidate: INFINITE_CACHE,
    tags: null,
  }
  return workUnitAsyncStorage.run(
    cacheStore,
    generateCacheEntryImpl,
    workStore,
    clientReferenceManifest,
    cacheHandler,
    serializedCacheKey,
    encodedArguments,
    fn
  )
}

async function generateCacheEntryImpl(
  workStore: WorkStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  cacheHandler: CacheHandler,
  serializedCacheKey: string | ArrayBuffer,
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

  // Invoke the inner function to load a new result.
  const result = fn.apply(null, args)

  let didError = false
  let firstError: any = null

  const stream = renderToReadableStream(
    result,
    clientReferenceManifest.clientModules,
    {
      environmentName: 'Cache',
      temporaryReferences,
      onError(error: any) {
        // Report the error.
        console.error(error)
        if (!didError) {
          didError = true
          firstError = error
        }
      },
    }
  )

  const [returnStream, savedStream] = stream.tee()

  // We create a stream that passed through the RSC render of the response.
  // It always runs to completion but at the very end, if something errored
  // or rejected anywhere in the render. We close the stream as errored.
  // This lets a CacheHandler choose to save the errored result for future
  // hits for a while to avoid unnecessary retries or not to retry.
  // We use the end of the stream for this to avoid another complicated
  // side-channel. A receiver has to consider that the stream might also
  // error for other reasons anyway such as losing connection.
  const reader = savedStream.getReader()
  const erroringSavedStream = new ReadableStream({
    pull(controller) {
      return reader.read().then(({ done, value }) => {
        if (done) {
          if (didError) {
            controller.error(firstError)
          } else {
            controller.close()
          }
          return
        }
        controller.enqueue(value)
      })
    },
    cancel(reason: any) {
      reader.cancel(reason)
    },
  })

  if (!workStore.pendingRevalidateWrites) {
    workStore.pendingRevalidateWrites = []
  }

  const promise = cacheHandler.set(serializedCacheKey, erroringSavedStream)

  workStore.pendingRevalidateWrites.push(promise)

  // Return the stream as we're creating it. This means that if it ends up
  // erroring we cannot return a stale-while-error version but it allows
  // streaming back the result earlier.
  return returnStream
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
          : // The FormData might contain binary data that is not valid UTF-8 so this
            // cannot be a string in this case. I.e. .text() is not valid here and it
            // is not valid to use TextDecoder on this result.
            await new Response(encodedArguments).arrayBuffer()

      let entry: undefined | CacheEntry =
        await cacheHandler.get(serializedCacheKey)

      // Get the clientReferenceManifestSingleton while we're still in the outer Context.
      // In case getClientReferenceManifestSingleton is implemented using AsyncLocalStorage.
      const clientReferenceManifestSingleton =
        getClientReferenceManifestSingleton()

      let stream
      if (
        entry === undefined ||
        (entry.stale && workStore.isStaticGeneration)
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

        stream = await generateCacheEntry(
          workStore,
          clientReferenceManifestSingleton,
          cacheHandler,
          serializedCacheKey,
          encodedArguments,
          fn
        )
      } else {
        stream = entry.value
        if (entry.stale) {
          // If this is stale, and we're not in a prerender (i.e. this is dynamic render),
          // then we should warm up the cache with a fresh revalidated entry.
          const ignoredStream = await generateCacheEntry(
            workStore,
            clientReferenceManifestSingleton,
            cacheHandler,
            serializedCacheKey,
            encodedArguments,
            fn
          )
          await ignoredStream.cancel()
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
