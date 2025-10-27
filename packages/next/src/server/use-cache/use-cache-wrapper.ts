import type { DeepReadonly } from '../../shared/lib/deep-readonly'
/* eslint-disable import/no-extraneous-dependencies */
import {
  renderToReadableStream,
  decodeReply,
  decodeReplyFromAsyncIterable,
  createTemporaryReferenceSet as createServerTemporaryReferenceSet,
} from 'react-server-dom-webpack/server'
import {
  createFromReadableStream,
  encodeReply,
  createTemporaryReferenceSet as createClientTemporaryReferenceSet,
} from 'react-server-dom-webpack/client'
import { prerender } from 'react-server-dom-webpack/static'
/* eslint-enable import/no-extraneous-dependencies */

import type { WorkStore } from '../app-render/work-async-storage.external'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import type {
  PrerenderStoreModernClient,
  PrerenderStoreModernRuntime,
  PrivateUseCacheStore,
  RequestStore,
  RevalidateStore,
  UseCacheStore,
  WorkUnitStore,
} from '../app-render/work-unit-async-storage.external'
import {
  getHmrRefreshHash,
  getRenderResumeDataCache,
  getPrerenderResumeDataCache,
  workUnitAsyncStorage,
  getDraftModeProviderForCacheScope,
  getCacheSignal,
  isHmrRefresh,
  getServerComponentsHmrCache,
  getRuntimeStagePromise,
} from '../app-render/work-unit-async-storage.external'

import {
  makeDevtoolsIOAwarePromise,
  makeHangingPromise,
} from '../dynamic-rendering-utils'

import type { ClientReferenceManifestForRsc } from '../../build/webpack/plugins/flight-manifest-plugin'

import {
  getClientReferenceManifestForRsc,
  getServerModuleMap,
} from '../app-render/encryption-utils'
import type { CacheEntry } from '../lib/cache-handlers/types'
import type { CacheSignal } from '../app-render/cache-signal'
import { decryptActionBoundArgs } from '../app-render/encryption'
import { InvariantError } from '../../shared/lib/invariant-error'
import { getDigestForWellKnownError } from '../app-render/create-error-handler'
import { DYNAMIC_EXPIRE, RUNTIME_PREFETCH_DYNAMIC_STALE } from './constants'
import { getCacheHandler } from './handlers'
import { UseCacheTimeoutError } from './use-cache-errors'
import {
  createHangingInputAbortSignal,
  postponeWithTracking,
  throwToInterruptStaticGeneration,
} from '../app-render/dynamic-rendering'
import {
  makeErroringSearchParamsForUseCache,
  type SearchParams,
} from '../request/search-params'
import type { Params } from '../request/params'
import React from 'react'
import { createLazyResult, isResolvedLazyResult } from '../lib/lazy-result'
import { dynamicAccessAsyncStorage } from '../app-render/dynamic-access-async-storage.external'
import { isReactLargeShellError } from '../app-render/react-large-shell-error'
import type { CacheLife } from './cache-life'
import { RenderStage } from '../app-render/staged-rendering'

interface PrivateCacheContext {
  readonly kind: 'private'
  readonly outerWorkUnitStore:
    | RequestStore
    | PrivateUseCacheStore
    | PrerenderStoreModernRuntime
}

interface PublicCacheContext {
  readonly kind: 'public'
  // TODO: We should probably forbid nesting "use cache" inside unstable_cache.
  readonly outerWorkUnitStore:
    | Exclude<WorkUnitStore, PrerenderStoreModernClient>
    | undefined
}

type CacheContext = PrivateCacheContext | PublicCacheContext

type CacheKeyParts =
  | [buildId: string, id: string, args: unknown[]]
  | [buildId: string, id: string, args: unknown[], hmrRefreshHash: string]

interface UseCachePageInnerProps {
  params: Promise<Params>
  searchParams?: Promise<SearchParams>
}

export interface UseCachePageProps {
  params: Promise<Params>
  searchParams: Promise<SearchParams>
  $$isPage: true
}

export type UseCacheLayoutProps = {
  params: Promise<Params>
  $$isLayout: true
} & {
  // The value type should be React.ReactNode. But such an index signature would
  // be incompatible with the other two props.
  [slot: string]: any
}

const isEdgeRuntime = process.env.NEXT_RUNTIME === 'edge'

const debug = process.env.NEXT_PRIVATE_DEBUG_CACHE
  ? console.debug.bind(console, 'use-cache:')
  : undefined

const filterStackFrame =
  process.env.NODE_ENV !== 'production'
    ? (require('../lib/source-maps') as typeof import('../lib/source-maps'))
        .filterStackFrameDEV
    : undefined
const findSourceMapURL =
  process.env.NODE_ENV !== 'production'
    ? (require('../lib/source-maps') as typeof import('../lib/source-maps'))
        .findSourceMapURLDEV
    : undefined

function generateCacheEntry(
  workStore: WorkStore,
  cacheContext: CacheContext,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifestForRsc>,
  encodedArguments: FormData | string,
  fn: (...args: unknown[]) => Promise<unknown>,
  sharedErrorStack: string | undefined
) {
  // We need to run this inside a clean AsyncLocalStorage snapshot so that the cache
  // generation cannot read anything from the context we're currently executing which
  // might include request specific things like cookies() inside a React.cache().
  // Note: It is important that we await at least once before this because it lets us
  // pop out of any stack specific contexts as well - aka "Sync" Local Storage.
  return workStore.runInCleanSnapshot(
    generateCacheEntryWithRestoredWorkStore,
    workStore,
    cacheContext,
    clientReferenceManifest,
    encodedArguments,
    fn,
    sharedErrorStack
  )
}

function generateCacheEntryWithRestoredWorkStore(
  workStore: WorkStore,
  cacheContext: CacheContext,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifestForRsc>,
  encodedArguments: FormData | string,
  fn: (...args: unknown[]) => Promise<unknown>,
  sharedErrorStack: string | undefined
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
    cacheContext,
    clientReferenceManifest,
    encodedArguments,
    fn,
    sharedErrorStack
  )
}

function createUseCacheStore(
  workStore: WorkStore,
  cacheContext: CacheContext,
  defaultCacheLife: Required<CacheLife>
): UseCacheStore {
  if (cacheContext.kind === 'private') {
    const outerWorkUnitStore = cacheContext.outerWorkUnitStore

    return {
      type: 'private-cache',
      phase: 'render',
      implicitTags: outerWorkUnitStore?.implicitTags,
      revalidate: defaultCacheLife.revalidate,
      expire: defaultCacheLife.expire,
      stale: defaultCacheLife.stale,
      explicitRevalidate: undefined,
      explicitExpire: undefined,
      explicitStale: undefined,
      tags: null,
      hmrRefreshHash: getHmrRefreshHash(workStore, outerWorkUnitStore),
      isHmrRefresh: isHmrRefresh(workStore, outerWorkUnitStore),
      serverComponentsHmrCache: getServerComponentsHmrCache(
        workStore,
        outerWorkUnitStore
      ),
      forceRevalidate: shouldForceRevalidate(workStore, outerWorkUnitStore),
      runtimeStagePromise: getRuntimeStagePromise(outerWorkUnitStore),
      draftMode: getDraftModeProviderForCacheScope(
        workStore,
        outerWorkUnitStore
      ),
      rootParams: outerWorkUnitStore.rootParams,
      headers: outerWorkUnitStore.headers,
      cookies: outerWorkUnitStore.cookies,
    }
  } else {
    let useCacheOrRequestStore: RequestStore | UseCacheStore | undefined
    const outerWorkUnitStore = cacheContext.outerWorkUnitStore

    if (outerWorkUnitStore) {
      switch (outerWorkUnitStore?.type) {
        case 'cache':
        case 'private-cache':
        case 'request':
          useCacheOrRequestStore = outerWorkUnitStore
          break
        case 'prerender-runtime':
        case 'prerender':
        case 'prerender-ppr':
        case 'prerender-legacy':
        case 'unstable-cache':
          break
        default:
          outerWorkUnitStore satisfies never
      }
    }

    return {
      type: 'cache',
      phase: 'render',
      implicitTags: outerWorkUnitStore?.implicitTags,
      revalidate: defaultCacheLife.revalidate,
      expire: defaultCacheLife.expire,
      stale: defaultCacheLife.stale,
      explicitRevalidate: undefined,
      explicitExpire: undefined,
      explicitStale: undefined,
      tags: null,
      hmrRefreshHash:
        outerWorkUnitStore && getHmrRefreshHash(workStore, outerWorkUnitStore),
      isHmrRefresh: useCacheOrRequestStore?.isHmrRefresh ?? false,
      serverComponentsHmrCache:
        useCacheOrRequestStore?.serverComponentsHmrCache,
      forceRevalidate: shouldForceRevalidate(workStore, outerWorkUnitStore),
      draftMode:
        outerWorkUnitStore &&
        getDraftModeProviderForCacheScope(workStore, outerWorkUnitStore),
    }
  }
}

function assertDefaultCacheLife(
  defaultCacheLife: CacheLife | undefined
): asserts defaultCacheLife is Required<CacheLife> {
  if (
    !defaultCacheLife ||
    defaultCacheLife.revalidate == null ||
    defaultCacheLife.expire == null ||
    defaultCacheLife.stale == null
  ) {
    throw new InvariantError(
      'A default cacheLife profile must always be provided.'
    )
  }
}

function generateCacheEntryWithCacheContext(
  workStore: WorkStore,
  cacheContext: CacheContext,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifestForRsc>,
  encodedArguments: FormData | string,
  fn: (...args: unknown[]) => Promise<unknown>,
  sharedErrorStack: string | undefined
) {
  if (!workStore.cacheLifeProfiles) {
    throw new InvariantError('cacheLifeProfiles should always be provided.')
  }
  const defaultCacheLife = workStore.cacheLifeProfiles['default']
  assertDefaultCacheLife(defaultCacheLife)

  // Initialize the Store for this Cache entry.
  const cacheStore = createUseCacheStore(
    workStore,
    cacheContext,
    defaultCacheLife
  )

  return workUnitAsyncStorage.run(cacheStore, () =>
    dynamicAccessAsyncStorage.run(
      { abortController: new AbortController() },
      generateCacheEntryImpl,
      workStore,
      cacheContext,
      cacheStore,
      clientReferenceManifest,
      encodedArguments,
      fn,
      sharedErrorStack
    )
  )
}

function propagateCacheLifeAndTagsToRevalidateStore(
  revalidateStore: RevalidateStore,
  entry: CacheEntry
): void {
  const outerTags = (revalidateStore.tags ??= [])

  for (const tag of entry.tags) {
    if (!outerTags.includes(tag)) {
      outerTags.push(tag)
    }
  }

  if (revalidateStore.stale > entry.stale) {
    revalidateStore.stale = entry.stale
  }

  if (revalidateStore.revalidate > entry.revalidate) {
    revalidateStore.revalidate = entry.revalidate
  }

  if (revalidateStore.expire > entry.expire) {
    revalidateStore.expire = entry.expire
  }
}

function propagateCacheLifeAndTags(
  cacheContext: CacheContext,
  entry: CacheEntry
): void {
  if (cacheContext.kind === 'private') {
    switch (cacheContext.outerWorkUnitStore.type) {
      case 'prerender-runtime':
      case 'private-cache':
        propagateCacheLifeAndTagsToRevalidateStore(
          cacheContext.outerWorkUnitStore,
          entry
        )
        break
      case 'request':
      case undefined:
        break
      default:
        cacheContext.outerWorkUnitStore satisfies never
    }
  } else {
    switch (cacheContext.outerWorkUnitStore?.type) {
      case 'cache':
      case 'private-cache':
      case 'prerender':
      case 'prerender-runtime':
      case 'prerender-ppr':
      case 'prerender-legacy':
        propagateCacheLifeAndTagsToRevalidateStore(
          cacheContext.outerWorkUnitStore,
          entry
        )
        break
      case 'request':
      case 'unstable-cache':
      case undefined:
        break
      default:
        cacheContext.outerWorkUnitStore satisfies never
    }
  }
}

async function collectResult(
  savedStream: ReadableStream<Uint8Array>,
  workStore: WorkStore,
  cacheContext: CacheContext,
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

  const buffer: Uint8Array[] = []
  const reader = savedStream.getReader()

  try {
    for (let entry; !(entry = await reader.read()).done; ) {
      buffer.push(entry.value)
    }
  } catch (error) {
    errors.push(error)
  }

  let idx = 0
  const bufferStream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (workStore.invalidDynamicUsageError) {
        controller.error(workStore.invalidDynamicUsageError)
      } else if (idx < buffer.length) {
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

  const entry: CacheEntry = {
    value: bufferStream,
    timestamp: startTime,
    revalidate: collectedRevalidate,
    expire: collectedExpire,
    stale: collectedStale,
    tags: collectedTags === null ? [] : collectedTags,
  }

  if (cacheContext.outerWorkUnitStore) {
    const outerWorkUnitStore = cacheContext.outerWorkUnitStore

    // Propagate cache life & tags to the parent context if appropriate.
    switch (outerWorkUnitStore.type) {
      case 'prerender':
      case 'prerender-runtime': {
        // If we've just created a cache result, and we're filling caches for a
        // Cache Components prerender, then we don't want to propagate cache
        // life & tags yet, in case the entry ends up being omitted from the
        // final prerender due to short expire/stale times. If it is omitted,
        // then it shouldn't have any effects on the prerender. We'll decide
        // whether or not this cache should have its life & tags propagated when
        // we read the entry in the final prerender from the resume data cache.

        break
      }
      case 'request': {
        if (
          process.env.NODE_ENV === 'development' &&
          outerWorkUnitStore.cacheSignal
        ) {
          // If we're filling caches for a dev request, apply the same logic as prerenders do above,
          // and don't propagate cache life/tags yet.
          break
        }
        // fallthrough
      }

      case 'private-cache':
      case 'cache':
      case 'unstable-cache':
      case 'prerender-legacy':
      case 'prerender-ppr': {
        propagateCacheLifeAndTags(cacheContext, entry)
        break
      }
      default: {
        outerWorkUnitStore satisfies never
      }
    }

    const cacheSignal = getCacheSignal(outerWorkUnitStore)
    if (cacheSignal) {
      cacheSignal.endRead()
    }
  }

  return entry
}

type GenerateCacheEntryResult =
  | {
      readonly type: 'cached'
      readonly stream: ReadableStream
      readonly pendingCacheEntry: Promise<CacheEntry>
    }
  | {
      readonly type: 'prerender-dynamic'
      readonly hangingPromise: Promise<never>
    }

async function generateCacheEntryImpl(
  workStore: WorkStore,
  cacheContext: CacheContext,
  innerCacheStore: UseCacheStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifestForRsc>,
  encodedArguments: FormData | string,
  fn: (...args: unknown[]) => Promise<unknown>,
  sharedErrorStack: string | undefined
): Promise<GenerateCacheEntryResult> {
  const temporaryReferences = createServerTemporaryReferenceSet()
  const outerWorkUnitStore = cacheContext.outerWorkUnitStore

  const [, , args] =
    typeof encodedArguments === 'string'
      ? await decodeReply<CacheKeyParts>(
          encodedArguments,
          getServerModuleMap(),
          { temporaryReferences }
        )
      : await decodeReplyFromAsyncIterable<CacheKeyParts>(
          {
            async *[Symbol.asyncIterator]() {
              for (const entry of encodedArguments) {
                yield entry
              }

              if (outerWorkUnitStore) {
                switch (outerWorkUnitStore.type) {
                  case 'prerender-runtime':
                  case 'prerender':
                    // The encoded arguments might contain hanging promises. In
                    // this case we don't want to reject with "Error: Connection
                    // closed.", so we intentionally keep the iterable alive.
                    // This is similar to the halting trick that we do while
                    // rendering.
                    await new Promise<void>((resolve) => {
                      if (outerWorkUnitStore.renderSignal.aborted) {
                        resolve()
                      } else {
                        outerWorkUnitStore.renderSignal.addEventListener(
                          'abort',
                          () => resolve(),
                          { once: true }
                        )
                      }
                    })
                    break
                  case 'prerender-ppr':
                  case 'prerender-legacy':
                  case 'request':
                  case 'cache':
                  case 'private-cache':
                  case 'unstable-cache':
                    break
                  default:
                    outerWorkUnitStore satisfies never
                }
              }
            },
          },
          getServerModuleMap(),
          { temporaryReferences }
        )

  // Track the timestamp when we started computing the result.
  const startTime = performance.timeOrigin + performance.now()

  // Invoke the inner function to load a new result. We delay the invocation
  // though, until React awaits the promise so that React's request store (ALS)
  // is available when the function is invoked. This allows us, for example, to
  // capture logs so that we can later replay them.
  const resultPromise = createLazyResult(() => fn.apply(null, args))

  let errors: Array<unknown> = []

  // In the "Cache" environment, we only need to make sure that the error
  // digests are handled correctly. Error formatting and reporting is not
  // necessary here; the errors are encoded in the stream, and will be reported
  // in the "Server" environment.
  const handleError = (error: unknown): string | undefined => {
    const digest = getDigestForWellKnownError(error)

    if (digest) {
      return digest
    }

    if (isReactLargeShellError(error)) {
      // TODO: Aggregate
      console.error(error)
      return undefined
    }

    if (process.env.NODE_ENV !== 'development') {
      // TODO: For now we're also reporting the error here, because in
      // production, the "Server" environment will only get the obfuscated
      // error (created by the Flight Client in the cache wrapper).
      console.error(error)
    }

    errors.push(error)
  }

  let stream: ReadableStream<Uint8Array>

  switch (outerWorkUnitStore?.type) {
    case 'prerender-runtime':
    case 'prerender':
      const timeoutAbortController = new AbortController()

      // If we're prerendering, we give you 50 seconds to fill a cache entry.
      // Otherwise we assume you stalled on hanging input and de-opt. This needs
      // to be lower than just the general timeout of 60 seconds.
      const timer = setTimeout(() => {
        const error = new UseCacheTimeoutError()
        if (sharedErrorStack) {
          error.stack = error.name + ': ' + error.message + sharedErrorStack
        }
        workStore.invalidDynamicUsageError = error
        timeoutAbortController.abort(error)
      }, 50000)

      const dynamicAccessAbortSignal =
        dynamicAccessAsyncStorage.getStore()?.abortController.signal

      const abortSignal = dynamicAccessAbortSignal
        ? AbortSignal.any([
            dynamicAccessAbortSignal,
            outerWorkUnitStore.renderSignal,
            timeoutAbortController.signal,
          ])
        : timeoutAbortController.signal

      const { prelude } = await prerender(
        resultPromise,
        clientReferenceManifest.clientModules,
        {
          environmentName: 'Cache',
          filterStackFrame,
          signal: abortSignal,
          temporaryReferences,
          onError(error) {
            if (abortSignal.aborted && abortSignal.reason === error) {
              return undefined
            }

            return handleError(error)
          },
        }
      )

      clearTimeout(timer)

      if (timeoutAbortController.signal.aborted) {
        // When the timeout is reached we always error the stream. Even for
        // fallback shell prerenders we don't want to return a hanging promise,
        // which would allow the function to become a dynamic hole. Because that
        // would mean that a non-empty shell could be generated which would be
        // subject to revalidation, and we don't want to create long
        // revalidation times.
        stream = new ReadableStream({
          start(controller) {
            controller.error(timeoutAbortController.signal.reason)
          },
        })
      } else if (dynamicAccessAbortSignal?.aborted) {
        // If the prerender is aborted because of dynamic access (e.g. reading
        // fallback params), we return a hanging promise. This essentially makes
        // the "use cache" function dynamic.
        const hangingPromise = makeHangingPromise<never>(
          outerWorkUnitStore.renderSignal,
          workStore.route,
          abortSignal.reason
        )

        if (outerWorkUnitStore.cacheSignal) {
          outerWorkUnitStore.cacheSignal.endRead()
        }

        return { type: 'prerender-dynamic', hangingPromise }
      } else {
        stream = prelude
      }
      break
    case 'prerender-ppr':
    case 'prerender-legacy':
    case 'request':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case undefined:
      stream = renderToReadableStream(
        resultPromise,
        clientReferenceManifest.clientModules,
        {
          environmentName: 'Cache',
          filterStackFrame,
          temporaryReferences,
          onError: handleError,
        }
      )
      break
    default:
      return outerWorkUnitStore satisfies never
  }

  const [returnStream, savedStream] = stream.tee()

  const pendingCacheEntry = collectResult(
    savedStream,
    workStore,
    cacheContext,
    innerCacheStore,
    startTime,
    errors
  )

  if (process.env.NODE_ENV === 'development') {
    // Name the stream for React DevTools.
    // @ts-expect-error
    returnStream.name = 'use cache'
  }

  return {
    type: 'cached',
    // Return the stream as we're creating it. This means that if it ends up
    // erroring we cannot return a stale-if-error version but it allows
    // streaming back the result earlier.
    stream: returnStream,
    pendingCacheEntry,
  }
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

function wrapAsInvalidDynamicUsageError(
  error: Error,
  sharedErrorStack: string | undefined,
  workStore: WorkStore
) {
  if (sharedErrorStack) {
    error.stack = error.name + ': ' + error.message + sharedErrorStack
  }

  workStore.invalidDynamicUsageError ??= error

  return error
}

export function cache(
  kind: string,
  id: string,
  boundArgsLength: number,
  originalFn: (...args: unknown[]) => Promise<unknown>
) {
  const isPrivate = kind === 'private'

  // Private caches are currently only stored in the Resume Data Cache (RDC),
  // and not in cache handlers.
  const cacheHandler = isPrivate ? undefined : getCacheHandler(kind)

  if (!isPrivate && !cacheHandler) {
    throw new Error('Unknown cache handler: ' + kind)
  }

  // Capture a better error stack in this scope.
  const sharedError = new Error()
  Error.captureStackTrace(sharedError, cache)
  const sharedErrorStack = sharedError.stack?.slice(
    sharedError.stack.indexOf('\n')
  )

  const name = originalFn.name
  const cachedFn = {
    [name]: async function (...args: any[]) {
      const workStore = workAsyncStorage.getStore()
      if (workStore === undefined) {
        throw new Error(
          '"use cache" cannot be used outside of App Router. Expected a WorkStore.'
        )
      }

      let fn = originalFn

      const workUnitStore = workUnitAsyncStorage.getStore()

      let cacheContext: CacheContext

      if (isPrivate) {
        const expression = '"use cache: private"'

        switch (workUnitStore?.type) {
          // "use cache: private" is dynamic in prerendering contexts.
          case 'prerender':
            return makeHangingPromise(
              workUnitStore.renderSignal,
              workStore.route,
              expression
            )
          case 'prerender-ppr':
            return postponeWithTracking(
              workStore.route,
              expression,
              workUnitStore.dynamicTracking
            )
          case 'prerender-legacy':
            return throwToInterruptStaticGeneration(
              expression,
              workStore,
              workUnitStore
            )
          case 'prerender-client':
            throw new InvariantError(
              `${expression} must not be used within a client component. Next.js should be preventing ${expression} from being allowed in client components statically, but did not in this case.`
            )
          case 'unstable-cache': {
            throw wrapAsInvalidDynamicUsageError(
              new Error(
                // TODO: Add a link to an error documentation page when we have one.
                `${expression} must not be used within \`unstable_cache()\`.`
              ),
              sharedErrorStack,
              workStore
            )
          }
          case 'cache': {
            throw wrapAsInvalidDynamicUsageError(
              new Error(
                // TODO: Add a link to an error documentation page when we have one.
                `${expression} must not be used within "use cache". It can only be nested inside of another ${expression}.`
              ),
              sharedErrorStack,
              workStore
            )
          }
          case 'request':
          case 'prerender-runtime':
          case 'private-cache':
            cacheContext = {
              kind: 'private',
              outerWorkUnitStore: workUnitStore,
            }
            break
          case undefined:
            throw wrapAsInvalidDynamicUsageError(
              new Error(
                // TODO: Add a link to an error documentation page when we have one.
                `${expression} cannot be used outside of a request context.`
              ),
              sharedErrorStack,
              workStore
            )
          default:
            workUnitStore satisfies never
            // This is dead code, but without throwing an error here, TypeScript
            // will assume that cacheContext is used before being assigned.
            throw new InvariantError(`Unexpected work unit store.`)
        }
      } else {
        switch (workUnitStore?.type) {
          case 'prerender-client':
            const expression = '"use cache"'
            throw new InvariantError(
              `${expression} must not be used within a client component. Next.js should be preventing ${expression} from being allowed in client components statically, but did not in this case.`
            )
          case 'prerender':
          case 'prerender-runtime':
          case 'prerender-ppr':
          case 'prerender-legacy':
          case 'request':
          case 'cache':
          case 'private-cache':
          // TODO: We should probably forbid nesting "use cache" inside
          // unstable_cache. (fallthrough)
          case 'unstable-cache':
          case undefined:
            cacheContext = {
              kind: 'public',
              outerWorkUnitStore: workUnitStore,
            }
            break
          default:
            workUnitStore satisfies never
            // This is dead code, but without throwing an error here, TypeScript
            // will assume that cacheContext is used before being assigned.
            throw new InvariantError(`Unexpected work unit store.`)
        }
      }

      // Get the clientReferenceManifest while we're still in the outer Context.
      // In case getClientReferenceManifestSingleton is implemented using AsyncLocalStorage.
      const clientReferenceManifest = getClientReferenceManifestForRsc()

      // Because the Action ID is not yet unique per implementation of that Action we can't
      // safely reuse the results across builds yet. In the meantime we add the buildId to the
      // arguments as a seed to ensure they're not reused. Remove this once Action IDs hash
      // the implementation.
      const buildId = workStore.buildId

      // In dev mode, when the HMR refresh hash is set, we include it in the
      // cache key. This ensures that cache entries are not reused when server
      // components have been edited. This is a very coarse approach. But it's
      // also only a temporary solution until Action IDs are unique per
      // implementation. Remove this once Action IDs hash the implementation.
      const hmrRefreshHash =
        workUnitStore && getHmrRefreshHash(workStore, workUnitStore)

      const hangingInputAbortSignal = workUnitStore
        ? createHangingInputAbortSignal(workUnitStore)
        : undefined

      if (cacheContext.kind === 'private') {
        const { outerWorkUnitStore } = cacheContext
        switch (outerWorkUnitStore.type) {
          case 'prerender-runtime': {
            // In a runtime prerender, we have to make sure that APIs that would hang during a static prerender
            // are resolved with a delay, in the runtime stage. Private caches are one of these.
            if (outerWorkUnitStore.runtimeStagePromise) {
              await outerWorkUnitStore.runtimeStagePromise
            }
            break
          }
          case 'request': {
            if (process.env.NODE_ENV === 'development') {
              // Similar to runtime prerenders, private caches should not resolve in the static stage
              // of a dev request, so we delay them.
              await makeDevtoolsIOAwarePromise(
                undefined,
                outerWorkUnitStore,
                RenderStage.Runtime
              )
            }
            break
          }
          case 'private-cache':
            break
          default: {
            outerWorkUnitStore satisfies never
          }
        }
      }

      let isPageOrLayoutSegmentFunction = false

      // For page and layout segment functions (i.e. the page/layout component,
      // or generateMetadata/generateViewport), the cache function is
      // overwritten, which allows us to apply special handling for params and
      // searchParams. For pages and layouts we're using the outer params prop,
      // and not the inner one that was serialized/deserialized. While it's not
      // generally true for "use cache" args, in the case of `params` the inner
      // and outer object are essentially equivalent, so this is safe to do
      // (including fallback params that are hanging promises). It allows us to
      // avoid waiting for the timeout, when prerendering a fallback shell of a
      // cached page or layout that awaits params.
      if (isPageSegmentFunction(args)) {
        isPageOrLayoutSegmentFunction = true

        const [
          { params: outerParams, searchParams: outerSearchParams },
          ...otherOuterArgs
        ] = args

        const props: UseCachePageInnerProps = {
          params: outerParams,
          // Omit searchParams and $$isPage.
        }

        if (isPrivate) {
          // Private caches allow accessing search params. We need to include
          // them in the serialized args and when generating the cache key.
          props.searchParams = outerSearchParams
        }

        args = [props, ...otherOuterArgs]

        fn = {
          [name]: async (
            {
              params: _innerParams,
              searchParams: innerSearchParams,
            }: UseCachePageInnerProps,
            ...otherInnerArgs: unknown[]
          ) =>
            originalFn.apply(null, [
              {
                params: outerParams,
                searchParams:
                  innerSearchParams ??
                  // For public caches, search params are omitted from the cache
                  // key (and the serialized args) to avoid mismatches between
                  // prerendering and resuming a cached page that does not
                  // access search params. This is also the reason why we're not
                  // using a hanging promise for search params. For cached pages
                  // that do access them, which is an invalid dynamic usage, we
                  // need to ensure that an error is shown.
                  makeErroringSearchParamsForUseCache(workStore),
              },
              ...otherInnerArgs,
            ]),
        }[name] as (...args: unknown[]) => Promise<unknown>
      } else if (isLayoutSegmentFunction(args)) {
        isPageOrLayoutSegmentFunction = true

        const [
          { params: outerParams, $$isLayout, ...outerSlots },
          ...otherOuterArgs
        ] = args

        // Overwrite the props to omit $$isLayout. Note that slots are only
        // passed to the layout component (if any are defined), and not to
        // generateMetadata nor generateViewport. For those functions,
        // outerSlots/innerSlots is an empty object, which is fine because we're
        // just spreading it into the props.
        args = [{ params: outerParams, ...outerSlots }, ...otherOuterArgs]

        fn = {
          [name]: async (
            {
              params: _innerParams,
              ...innerSlots
            }: Omit<UseCacheLayoutProps, '$$isLayout'>,
            ...otherInnerArgs: unknown[]
          ) =>
            originalFn.apply(null, [
              { params: outerParams, ...innerSlots },
              ...otherInnerArgs,
            ]),
        }[name] as (...args: unknown[]) => Promise<unknown>
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

      // For private caches, which are allowed to read cookies, we still don't
      // need to include the cookies in the cache key. This is because we don't
      // store the cache entries in a cache handler, but only in the Resume Data
      // Cache (RDC). Private caches are only used during dynamic requests and
      // runtime prefetches. For dynamic requests, the RDC is immutable, so it
      // does not include any private caches. For runtime prefetches, the RDC is
      // mutable, but only lives as long as the request, so the key does not
      // need to include cookies.
      const cacheKeyParts: CacheKeyParts = hmrRefreshHash
        ? [buildId, id, args, hmrRefreshHash]
        : [buildId, id, args]

      const encodeCacheKeyParts = () =>
        encodeReply(cacheKeyParts, {
          temporaryReferences,
          signal: hangingInputAbortSignal,
        })

      let encodedCacheKeyParts: FormData | string

      switch (workUnitStore?.type) {
        case 'prerender-runtime':
        // We're currently only using `dynamicAccessAsyncStorage` for params,
        // which are always available in a runtime prerender, so they will never hang,
        // effectively making the tracking below a no-op.
        // However, a runtime prerender shares a lot of the semantics with a static prerender,
        // and might need to follow this codepath in the future
        // if we start using `dynamicAccessAsyncStorage` for other APIs.
        //
        // fallthrough
        case 'prerender':
          if (!isPageOrLayoutSegmentFunction) {
            // If the "use cache" function is not a page or layout segment
            // function, we need to track dynamic access already when encoding
            // the arguments. If params are passed explicitly into a "use cache"
            // function (as opposed to receiving them automatically in a page or
            // layout), we assume that the params are also accessed. This allows
            // us to abort early, and treat the function as dynamic, instead of
            // waiting for the timeout to be reached.
            const dynamicAccessAbortController = new AbortController()

            encodedCacheKeyParts = await dynamicAccessAsyncStorage.run(
              { abortController: dynamicAccessAbortController },
              encodeCacheKeyParts
            )

            if (dynamicAccessAbortController.signal.aborted) {
              return makeHangingPromise(
                workUnitStore.renderSignal,
                workStore.route,
                dynamicAccessAbortController.signal.reason.message
              )
            }
            break
          }
        // fallthrough
        case 'prerender-ppr':
        case 'prerender-legacy':
        case 'request':
        // TODO(restart-on-cache-miss): We need to handle params/searchParams on page components.
        // the promises will be tasky, so `encodeCacheKeyParts` will not resolve in the static stage.
        // We have not started a cache read at this point, so we might just miss the cache completely.
        // fallthrough
        case 'cache':
        case 'private-cache':
        case 'unstable-cache':
        case undefined:
          encodedCacheKeyParts = await encodeCacheKeyParts()
          break
        default:
          return workUnitStore satisfies never
      }

      const serializedCacheKey =
        typeof encodedCacheKeyParts === 'string'
          ? // Fast path for the simple case for simple inputs. We let the CacheHandler
            // Convert it to an ArrayBuffer if it wants to.
            encodedCacheKeyParts
          : await encodeFormData(encodedCacheKeyParts)

      let stream: undefined | ReadableStream = undefined

      // Get an immutable and mutable versions of the resume data cache.
      const prerenderResumeDataCache = workUnitStore
        ? getPrerenderResumeDataCache(workUnitStore)
        : null
      const renderResumeDataCache = workUnitStore
        ? getRenderResumeDataCache(workUnitStore)
        : null

      if (renderResumeDataCache) {
        const cacheSignal = workUnitStore ? getCacheSignal(workUnitStore) : null

        if (cacheSignal) {
          cacheSignal.beginRead()
        }
        const cachedEntry = renderResumeDataCache.cache.get(serializedCacheKey)
        if (cachedEntry !== undefined) {
          const existingEntry = await cachedEntry
          if (workUnitStore !== undefined && existingEntry !== undefined) {
            if (
              existingEntry.revalidate === 0 ||
              existingEntry.expire < DYNAMIC_EXPIRE
            ) {
              switch (workUnitStore.type) {
                case 'prerender':
                  // In a Dynamic I/O prerender, if the cache entry has
                  // revalidate: 0 or if the expire time is under 5 minutes,
                  // then we consider this cache entry dynamic as it's not worth
                  // generating static pages for such data. It's better to leave
                  // a dynamic hole that can be filled in during the resume with
                  // a potentially cached entry.
                  if (cacheSignal) {
                    cacheSignal.endRead()
                  }
                  return makeHangingPromise(
                    workUnitStore.renderSignal,
                    workStore.route,
                    'dynamic "use cache"'
                  )
                case 'prerender-runtime': {
                  // In the final phase of a runtime prerender, we have to make
                  // sure that APIs that would hang during a static prerender
                  // are resolved with a delay, in the runtime stage.
                  if (workUnitStore.runtimeStagePromise) {
                    await workUnitStore.runtimeStagePromise
                  }
                  break
                }
                case 'request': {
                  if (process.env.NODE_ENV === 'development') {
                    // We delay the cache here so that it doesn't resolve in the static task --
                    // in a regular static prerender, it'd be a hanging promise, and we need to reflect that,
                    // so it has to resolve later.
                    // TODO(restart-on-cache-miss): Optimize this to avoid unnecessary restarts.
                    // We don't end the cache read here, so this will always appear as a cache miss in the static stage,
                    // and thus will cause a restart even if all caches are filled.
                    await makeDevtoolsIOAwarePromise(
                      undefined,
                      workUnitStore,
                      RenderStage.Runtime
                    )
                  }
                  break
                }
                case 'prerender-ppr':
                case 'prerender-legacy':
                case 'cache':
                case 'private-cache':
                case 'unstable-cache':
                  break
                default:
                  workUnitStore satisfies never
              }
            }

            if (existingEntry.stale < RUNTIME_PREFETCH_DYNAMIC_STALE) {
              switch (workUnitStore.type) {
                case 'prerender-runtime':
                  // In a runtime prerender, if the cache entry will become
                  // stale in less then 30 seconds, we consider this cache entry
                  // dynamic as it's not worth prefetching. It's better to leave
                  // a dynamic hole that can be filled during the navigation.
                  if (cacheSignal) {
                    cacheSignal.endRead()
                  }
                  return makeHangingPromise(
                    workUnitStore.renderSignal,
                    workStore.route,
                    'dynamic "use cache"'
                  )
                case 'request': {
                  if (process.env.NODE_ENV === 'development') {
                    // We delay the cache here so that it doesn't resolve in the runtime phase --
                    // in a regular runtime prerender, it'd be a hanging promise, and we need to reflect that,
                    // so it has to resolve later.
                    // TODO(restart-on-cache-miss): Optimize this to avoid unnecessary restarts.
                    // We don't end the cache read here, so this will always appear as a cache miss in the runtime stage,
                    // and thus will cause a restart even if all caches are filled.
                    await makeDevtoolsIOAwarePromise(
                      undefined,
                      workUnitStore,
                      RenderStage.Dynamic
                    )
                  }
                  break
                }
                case 'prerender':
                case 'prerender-ppr':
                case 'prerender-legacy':
                case 'cache':
                case 'private-cache':
                case 'unstable-cache':
                  break
                default:
                  workUnitStore satisfies never
              }
            }
          }

          // We want to make sure we only propagate cache life & tags if the
          // entry was *not* omitted from the prerender. So we only do this
          // after the above early returns.
          propagateCacheLifeAndTags(cacheContext, existingEntry)

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

          if (workUnitStore) {
            switch (workUnitStore.type) {
              case 'prerender':
                // If `allowEmptyStaticShell` is true, and thus a prefilled
                // resume data cache was provided, then a cache miss means that
                // params were part of the cache key. In this case, we can make
                // this cache function a dynamic hole in the shell (or produce
                // an empty shell if there's no parent suspense boundary).
                // Currently, this also includes layouts and pages that don't
                // read params, which will be improved when we implement
                // NAR-136. Otherwise, we assume that if params are passed
                // explicitly into a "use cache" function, that the params are
                // also accessed. This allows us to abort early, and treat the
                // function as dynamic, instead of waiting for the timeout to be
                // reached. Compared to the instrumentation-based params bailout
                // we do here, this also covers the case where params are
                // transformed with an async function, before being passed into
                // the "use cache" function, which escapes the instrumentation.
                if (workUnitStore.allowEmptyStaticShell) {
                  return makeHangingPromise(
                    workUnitStore.renderSignal,
                    workStore.route,
                    'dynamic "use cache"'
                  )
                }
                break
              case 'prerender-runtime':
              case 'prerender-ppr':
              case 'prerender-legacy':
              case 'request':
              case 'cache':
              case 'private-cache':
              case 'unstable-cache':
                break
              default:
                workUnitStore satisfies never
            }
          }
        }
      }

      if (stream === undefined) {
        const cacheSignal = workUnitStore ? getCacheSignal(workUnitStore) : null
        if (cacheSignal) {
          // Either the cache handler or the generation can be using I/O at this point.
          // We need to track when they start and when they complete.
          cacheSignal.beginRead()
        }

        const lazyRefreshTags = workStore.refreshTagsByCacheKind.get(kind)

        if (lazyRefreshTags && !isResolvedLazyResult(lazyRefreshTags)) {
          await lazyRefreshTags
        }

        let entry: CacheEntry | undefined

        // We ignore existing cache entries when force revalidating.
        if (cacheHandler && !shouldForceRevalidate(workStore, workUnitStore)) {
          entry = await cacheHandler.get(
            serializedCacheKey,
            workUnitStore?.implicitTags?.tags ?? []
          )
        }

        if (entry) {
          const implicitTags = workUnitStore?.implicitTags?.tags ?? []
          let implicitTagsExpiration = 0

          if (workUnitStore?.implicitTags) {
            const lazyExpiration =
              workUnitStore.implicitTags.expirationsByCacheKind.get(kind)

            if (lazyExpiration) {
              const expiration = isResolvedLazyResult(lazyExpiration)
                ? lazyExpiration.value
                : await lazyExpiration

              // If a cache handler returns an expiration time of Infinity, it
              // signals to Next.js that it handles checking cache entries for
              // staleness based on the expiration of the implicit tags passed
              // into the `get` method. In this case, we keep the default of 0,
              // which means that the implicit tags are not considered expired.
              if (expiration < Infinity) {
                implicitTagsExpiration = expiration
              }
            }
          }

          if (
            shouldDiscardCacheEntry(
              entry,
              workStore,
              workUnitStore,
              implicitTags,
              implicitTagsExpiration
            )
          ) {
            debug?.('discarding expired entry', serializedCacheKey)
            entry = undefined
          }
        }

        const currentTime = performance.timeOrigin + performance.now()
        if (
          workUnitStore !== undefined &&
          entry !== undefined &&
          (entry.revalidate === 0 || entry.expire < DYNAMIC_EXPIRE)
        ) {
          switch (workUnitStore.type) {
            case 'prerender':
              // In a Dynamic I/O prerender, if the cache entry has revalidate:
              // 0 or if the expire time is under 5 minutes, then we consider
              // this cache entry dynamic as it's not worth generating static
              // pages for such data. It's better to leave a dynamic hole that
              // can be filled in during the resume with a potentially cached
              // entry.
              if (cacheSignal) {
                cacheSignal.endRead()
              }
              return makeHangingPromise(
                workUnitStore.renderSignal,
                workStore.route,
                'dynamic "use cache"'
              )
            case 'request': {
              if (process.env.NODE_ENV === 'development') {
                // We delay the cache here so that it doesn't resolve in the static task --
                // in a regular static prerender, it'd be a hanging promise, and we need to reflect that,
                // so it has to resolve later.
                // TODO(restart-on-cache-miss): Optimize this to avoid unnecessary restarts.
                // We don't end the cache read here, so this will always appear as a cache miss in the static stage,
                // and thus will cause a restart even if all caches are filled.
                await makeDevtoolsIOAwarePromise(
                  undefined,
                  workUnitStore,
                  RenderStage.Runtime
                )
              }
              break
            }
            case 'prerender-runtime':
            case 'prerender-ppr':
            case 'prerender-legacy':
            case 'cache':
            case 'private-cache':
            case 'unstable-cache':
              break
            default:
              workUnitStore satisfies never
          }
        }

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

          if (entry) {
            if (currentTime > entry.timestamp + entry.expire * 1000) {
              debug?.('entry is expired', serializedCacheKey)
            }

            if (
              workStore.isStaticGeneration &&
              currentTime > entry.timestamp + entry.revalidate * 1000
            ) {
              debug?.('static generation, entry is stale', serializedCacheKey)
            }
          }

          const result = await generateCacheEntry(
            workStore,
            cacheContext,
            clientReferenceManifest,
            encodedCacheKeyParts,
            fn,
            sharedErrorStack
          )

          if (result.type === 'prerender-dynamic') {
            return result.hangingPromise
          }

          const { stream: newStream, pendingCacheEntry } = result

          // When draft mode is enabled, we must not save the cache entry.
          if (!workStore.isDraftMode) {
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

            if (cacheHandler) {
              const promise = cacheHandler.set(
                serializedCacheKey,
                savedCacheEntry
              )

              workStore.pendingRevalidateWrites ??= []
              workStore.pendingRevalidateWrites.push(promise)
            }
          }

          stream = newStream
        } else {
          // If we have an entry at this point, this can't be a private cache
          // entry.
          if (cacheContext.kind === 'private') {
            throw new InvariantError(
              `A private cache entry must not be retrieved from the cache handler.`
            )
          }

          propagateCacheLifeAndTags(cacheContext, entry)

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
            // If this is stale, and we're not in a prerender (i.e. this is
            // dynamic render), then we should warm up the cache with a fresh
            // revalidated entry.
            const result = await generateCacheEntry(
              workStore,
              // This is not running within the context of this unit.
              { kind: cacheContext.kind, outerWorkUnitStore: undefined },
              clientReferenceManifest,
              encodedCacheKeyParts,
              fn,
              sharedErrorStack
            )

            if (result.type === 'cached') {
              const { stream: ignoredStream, pendingCacheEntry } = result
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

              if (cacheHandler) {
                const promise = cacheHandler.set(
                  serializedCacheKey,
                  savedCacheEntry
                )

                workStore.pendingRevalidateWrites ??= []
                workStore.pendingRevalidateWrites.push(promise)
              }

              await ignoredStream.cancel()
            }
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
        findSourceMapURL,
        serverConsumerManifest,
        temporaryReferences,
        replayConsoleLogs,
        environmentName: 'Cache',
      })
    },
  }[name]

  return React.cache(cachedFn)
}

/**
 * Returns `true` if the `'use cache'` function is the page component itself,
 * or `generateMetadata`/`generateViewport` in a page file.
 */
function isPageSegmentFunction(
  args: any[]
): args is [UseCachePageProps, ...unknown[]] {
  const [maybeProps] = args

  return (
    maybeProps !== null &&
    typeof maybeProps === 'object' &&
    (maybeProps as UseCachePageProps).$$isPage === true
  )
}

/**
 * Returns `true` if the `'use cache'` function is the layout component itself,
 * or `generateMetadata`/`generateViewport` in a layout file.
 */
function isLayoutSegmentFunction(
  args: any[]
): args is [UseCacheLayoutProps, ...unknown[]] {
  const [maybeProps] = args

  return (
    maybeProps !== null &&
    typeof maybeProps === 'object' &&
    (maybeProps as UseCacheLayoutProps).$$isLayout === true
  )
}

function shouldForceRevalidate(
  workStore: WorkStore,
  workUnitStore: WorkUnitStore | undefined
): boolean {
  if (workStore.isOnDemandRevalidate || workStore.isDraftMode) {
    return true
  }

  if (workStore.dev && workUnitStore) {
    switch (workUnitStore.type) {
      case 'request':
        return workUnitStore.headers.get('cache-control') === 'no-cache'
      case 'cache':
      case 'private-cache':
        return workUnitStore.forceRevalidate
      case 'prerender-runtime':
      case 'prerender':
      case 'prerender-client':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }
  }

  return false
}

function shouldDiscardCacheEntry(
  entry: CacheEntry,
  workStore: WorkStore,
  workUnitStore: WorkUnitStore | undefined,
  implicitTags: string[],
  implicitTagsExpiration: number
): boolean {
  // If the cache entry was created before any of the implicit tags were
  // revalidated last, we need to discard it.
  if (entry.timestamp <= implicitTagsExpiration) {
    debug?.(
      'entry was created at',
      entry.timestamp,
      'before implicit tags were revalidated at',
      implicitTagsExpiration
    )

    return true
  }

  // During prerendering, we ignore recently revalidated tags. In dev mode, we
  // can assume that the dynamic dev rendering will have discarded and recreated
  // the affected cache entries, and we don't want to discard those again during
  // the prerender validation. During build-time prerendering, there will never
  // be any pending revalidated tags.
  if (workUnitStore) {
    switch (workUnitStore.type) {
      case 'prerender':
        return false
      case 'prerender-runtime':
      case 'prerender-client':
      case 'prerender-ppr':
      case 'prerender-legacy':
      case 'request':
      case 'cache':
      case 'private-cache':
      case 'unstable-cache':
        break
      default:
        workUnitStore satisfies never
    }
  }

  // If the cache entry contains revalidated tags that the cache handler might
  // not know about yet, we need to discard it.
  if (entry.tags.some((tag) => isRecentlyRevalidatedTag(tag, workStore))) {
    return true
  }

  // Finally, if any of the implicit tags have been revalidated recently, we
  // also need to discard the cache entry.
  if (implicitTags.some((tag) => isRecentlyRevalidatedTag(tag, workStore))) {
    return true
  }

  return false
}

function isRecentlyRevalidatedTag(tag: string, workStore: WorkStore): boolean {
  const { previouslyRevalidatedTags, pendingRevalidatedTags } = workStore

  // Was the tag previously revalidated (e.g. by a redirecting server action)?
  if (previouslyRevalidatedTags.includes(tag)) {
    debug?.('tag', tag, 'was previously revalidated')

    return true
  }

  // It could also have been revalidated by the currently running server action.
  // In this case the revalidation might not have been fully propagated by a
  // remote cache handler yet, so we read it from the pending tags in the work
  // store.
  if (pendingRevalidatedTags?.some((item) => item.tag === tag)) {
    debug?.('tag', tag, 'was just revalidated')

    return true
  }

  return false
}
