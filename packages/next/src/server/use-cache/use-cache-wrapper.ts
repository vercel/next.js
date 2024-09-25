import { createSnapshot } from '../../client/components/async-local-storage'
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

import type { StaticGenerationStore } from '../../client/components/static-generation-async-storage.external'
import { staticGenerationAsyncStorage } from '../../client/components/static-generation-async-storage.external'

type CacheEntry = {
  value: ReadableStream
  stale: boolean
}

interface CacheHandler {
  get(cacheKey: string | ArrayBuffer): Promise<undefined | CacheEntry>
  set(cacheKey: string | ArrayBuffer, value: ReadableStream): Promise<void>
  shouldRevalidateStale: boolean
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
  // In-memory caches are fragile and should not use stale-while-revalidate
  // semantics on the caches because it's not worth warming up an entry that's
  // likely going to get evicted before we get to use it anyway.
  shouldRevalidateStale: false,
})

const serverManifest: any = null // TODO
const clientManifest: any = null // TODO
const ssrManifest: any = {
  moduleMap: {},
  moduleLoading: null,
} // TODO

// TODO: Consider moving this another module that is guaranteed to be required in a safe scope.
const runInCleanSnapshot = createSnapshot()

async function generateCacheEntry(
  staticGenerationStore: StaticGenerationStore,
  cacheHandler: CacheHandler,
  serializedCacheKey: string | ArrayBuffer,
  encodedArguments: FormData | string,
  fn: any
): Promise<ReadableStream> {
  const temporaryReferences = createServerTemporaryReferenceSet()
  const [, args] = await decodeReply(encodedArguments, serverManifest, {
    temporaryReferences,
  })

  // Invoke the inner function to load a new result.
  const result = fn.apply(null, args)

  let didError = false
  let firstError: any = null

  const stream = renderToReadableStream(result, clientManifest, {
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
  })

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
      return reader
        .read()
        .then(({ done, value }: { done: boolean; value: any }) => {
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

  if (!staticGenerationStore.pendingRevalidateWrites) {
    staticGenerationStore.pendingRevalidateWrites = []
  }

  const promise = cacheHandler.set(serializedCacheKey, erroringSavedStream)

  staticGenerationStore.pendingRevalidateWrites.push(promise)

  // Return the stream as we're creating it. This means that if it ends up
  // erroring we cannot return a stale-while-error version but it allows
  // streaming back the result earlier.
  return returnStream
}

export function cache(kind: string, id: string, fn: any) {
  const cacheHandler = cacheHandlerMap.get(kind)
  if (cacheHandler === undefined) {
    throw new Error('Unknown cache handler: ' + kind)
  }
  const name = fn.name
  const cachedFn = {
    [name]: async function (...args: any[]) {
      const temporaryReferences = createClientTemporaryReferenceSet()
      const encodedArguments: FormData | string = await encodeReply(
        [id, args],
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

      const staticGenerationStore = staticGenerationAsyncStorage.getStore()
      if (staticGenerationStore === undefined) {
        throw new Error(
          '"use cache" cannot be used outside of App Router. Expected a StaticGenerationStore.'
        )
      }

      let stream
      if (
        entry === undefined ||
        (staticGenerationStore.isStaticGeneration && entry.stale)
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
        stream = await runInCleanSnapshot(
          generateCacheEntry,
          staticGenerationStore,
          cacheHandler,
          serializedCacheKey,
          encodedArguments,
          fn
        )
      } else {
        stream = entry.value
        if (entry.stale && cacheHandler.shouldRevalidateStale) {
          // If this is stale, and we're not in a prerender (i.e. this is dynamic render),
          // then we should warm up the cache with a fresh revalidated entry. We only do this
          // for long lived cache handlers because it's not worth warming up the cache with an
          // an entry that's just going to get evicted before we can use it anyway.
          const ignoredStream = await runInCleanSnapshot(
            generateCacheEntry,
            staticGenerationStore,
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
