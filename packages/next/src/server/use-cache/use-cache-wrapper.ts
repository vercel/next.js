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
  ValidationStoreClient,
  WorkUnitStore,
} from '../app-render/work-unit-async-storage.external'
import {
  getHmrRefreshHash,
  getResumeDataCache,
  workUnitAsyncStorage,
  getDraftModeProviderForCacheScope,
  getCacheSignal,
  isHmrRefresh,
  getServerComponentsHmrCache,
} from '../app-render/work-unit-async-storage.external'

import {
  applyOwnerStack,
  makeDevtoolsIOAwarePromise,
  makeHangingPromise,
  getSessionDataStage,
} from '../dynamic-rendering-utils'

import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

import {
  getClientReferenceManifest,
  getServerModuleMap,
} from '../app-render/manifests-singleton'
import type { CacheEntry } from '../lib/cache-handlers/types'
import type { CacheSignal } from '../app-render/cache-signal'
import { decryptActionBoundArgs } from '../app-render/encryption'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  createReactServerErrorHandler,
  type DigestedError,
} from '../app-render/create-error-handler'
import { createDigestWithErrorCode } from '../../lib/error-telemetry-utils'
import stringHash from 'next/dist/compiled/string-hash'
import { DYNAMIC_EXPIRE, DYNAMIC_STALE } from './constants'
import { NEXT_CACHE_ROOT_PARAM_TAG_ID } from '../../lib/constants'
import {
  getCacheHandler,
  getDevTieredCacheHandler,
  getPrivateCacheHandler,
  isCustomCacheHandler,
  isMemoryCacheDisabled,
} from './handlers'
import type { CacheReadWriteHandler } from './tiered-cache-handler'
import { cloneCacheEntry } from './clone-cache-entry'
import {
  NEXT_HMR_REFRESH_HASH_COOKIE,
  NEXT_INSTANT_TEST_COOKIE,
} from '../../client/components/app-router-headers'
import type { ReadonlyRequestCookies } from '../web/spec-extension/adapters/request-cookies'
import type { ReadonlyHeaders } from '../web/spec-extension/adapters/headers'
import {
  NestedDynamicUseCacheError,
  UseCacheDeadlockError,
  UseCacheTimeoutError,
} from './use-cache-errors'
import {
  createHangingInputAbortSignal,
  throwToInterruptStaticGeneration,
} from '../app-render/dynamic-rendering'
import {
  makeErroringSearchParamsForUseCache,
  type SearchParams,
} from '../request/search-params'
import type { Params } from '../request/params'
import type { ResumeDataCache } from '../resume-data-cache/resume-data-cache'
import { createLazyResult, isResolvedLazyResult } from '../lib/lazy-result'
import { dynamicAccessAsyncStorage } from '../app-render/dynamic-access-async-storage.external'
import type { CacheLife } from './cache-life'
import { RenderStage } from '../app-render/staged-rendering'
import * as Log from '../../build/output/log'
import { getServerReact, getClientReact } from '../runtime-reacts.external'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'

interface PrivateCacheContext {
  readonly kind: 'private'
  readonly outerWorkUnitStore:
    | RequestStore
    | PrivateUseCacheStore
    | PrerenderStoreModernRuntime
  readonly skipPropagation: boolean
  readonly outerOwnerStack: string | undefined
  /** The `'use cache'` function's server reference id (second arg of `cache()`). */
  readonly functionId: string
  /** The cache handler kind (first arg of `cache()`, e.g. 'default'). */
  readonly handlerKind: string
}

interface PublicCacheContext {
  readonly kind: 'public'
  // TODO: We should probably forbid nesting "use cache" inside unstable_cache.
  readonly outerWorkUnitStore: Exclude<
    WorkUnitStore,
    PrerenderStoreModernClient | ValidationStoreClient
  >
  readonly skipPropagation: boolean
  readonly outerOwnerStack: string | undefined
  /** The `'use cache'` function's server reference id (second arg of `cache()`). */
  readonly functionId: string
  /** The cache handler kind (first arg of `cache()`, e.g. 'default'). */
  readonly handlerKind: string
  /**
   * Eagerly captured at `cache()` entry, pointing at this invocation's call
   * site. Only set when the outer is itself a public `'use cache'` (i.e. when
   * this entry could become the propagated origin of a nested-dynamic cache
   * error in the parent). When this cache resolves dynamic, this is copied into
   * `outerWorkUnitStore.dynamicNestedCacheError` so the parent's error can use
   * it as `cause`.
   */
  readonly dynamicNestedCacheError: Error | undefined
}

type CacheContext = PrivateCacheContext | PublicCacheContext

export type CacheKeyParts =
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

/**
 * Cache entry metadata for propagation. Separated from the stream to make
 * ownership clear: metadata is freely shareable, streams must be explicitly
 * tee'd for each consumer.
 */
interface CacheResultMetadata {
  readonly tags: string[]
  readonly revalidate: number
  readonly expire: number
  readonly stale: number
  readonly timestamp: number
  readonly readRootParamNames: ReadonlySet<string> | undefined
  readonly hasExplicitRevalidate: boolean | undefined
  readonly hasExplicitExpire: boolean | undefined
  readonly dynamicNestedCacheError: Error | undefined
}

/**
 * Encapsulates a pending cache invocation for deduping. Manages lazy stream
 * tee-ing (via fork()) and metadata access for both intra-request and
 * cross-request joiners.
 */
class SharedCacheEntry {
  private stream: ReadableStream<Uint8Array>

  /**
   * The pending metadata promise. Cross-request joiners need to await this for
   * root param verification BEFORE calling fork(). Intra-request joiners chain
   * .then() for fire-and-forget propagation.
   */
  public readonly pendingMetadata: Promise<CacheResultMetadata>

  constructor(
    stream: ReadableStream<Uint8Array>,
    pendingMetadata: Promise<CacheResultMetadata>
  ) {
    this.stream = stream
    this.pendingMetadata = pendingMetadata
  }

  /**
   * Tee the stream: returns a copy for the caller, replaces the internal stream
   * with the remaining branch for future callers. Both the leader and joiners
   * call this — everyone gets a fork.
   */
  fork(): ReadableStream<Uint8Array> {
    const [forked, remaining] = this.stream.tee()
    this.stream = remaining
    return forked
  }
}

export type SharedCacheResult =
  | {
      readonly type: 'cached'
      readonly entry: SharedCacheEntry
    }
  | {
      readonly type: 'prerender-dynamic'
      readonly hangingPromise: Promise<never>
    }

/**
 * Manages the deferred promise for a shared cache result, tracks which maps
 * it's registered in, and drives cleanup from resolve/reject.
 *
 * For 'cached' results, cleanup is lazy: entries stay in the maps until
 * metadata/collection resolves, giving late-arriving invocations a chance to
 * join while the leader streams. For 'prerender-dynamic' and errors, cleanup
 * is immediate.
 */
class ResolvableSharedCacheResult {
  private readonly deferred = createPromiseWithResolvers<SharedCacheResult>()

  private readonly registrations: Array<{
    map: Map<string, Promise<SharedCacheResult>>
    key: string
  }> = []

  registerIn(map: Map<string, Promise<SharedCacheResult>>, key: string): void {
    map.set(key, this.deferred.promise)
    this.registrations.push({ map, key })
  }

  resolve(result: SharedCacheResult): void {
    this.deferred.resolve(result)
    if (result.type === 'cached') {
      result.entry.pendingMetadata.finally(this.cleanup.bind(this))
    } else {
      this.cleanup()
    }
  }

  reject(error: unknown): void {
    this.deferred.reject(error)
    this.cleanup()
  }

  private cleanup(): void {
    for (const { map, key } of this.registrations) {
      map.delete(key)
    }
  }
}

/**
 * Module-scope map for cross-request deduplication. Keyed by `cacheHandlerKey`
 * (specific key on warm path, coarse key on cold path). Entries live only for
 * the duration of the leader's invocation.
 */
const crossRequestPendingCacheInvocations = new Map<
  string,
  Promise<SharedCacheResult>
>()

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

const nestedCacheZeroRevalidateErrorMessage =
  `A "use cache" with zero \`revalidate\` is nested inside another "use cache" ` +
  `that has no explicit \`cacheLife\`, which is not allowed during ` +
  `prerendering. Add \`cacheLife()\` to the outer "use cache" to choose ` +
  `whether it should be prerendered (with non-zero \`revalidate\`) or remain ` +
  `dynamic (with zero \`revalidate\`). Read more: ` +
  `https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife`

const nestedCacheShortExpireErrorMessage =
  `A "use cache" with short \`expire\` (under 5 minutes) is nested inside ` +
  `another "use cache" that has no explicit \`cacheLife\`, which is not ` +
  `allowed during prerendering. Add \`cacheLife()\` to the outer "use cache" ` +
  `to choose whether it should be prerendered (with longer \`expire\`) or remain ` +
  `dynamic (with short \`expire\`). Read more: ` +
  `https://nextjs.org/docs/messages/nested-use-cache-no-explicit-cachelife`

// Tracks which root params each cache function has historically read. Used to
// compute the specific cache key upfront on subsequent invocations. In-memory
// only — after server restart, the coarse-key redirect entry in the cache
// handler provides fallback.
const knownRootParamsByFunctionId = new Map<string, Set<string>>()

function addKnownRootParamNames(
  id: string,
  names: ReadonlySet<string>
): Set<string> {
  const existing = knownRootParamsByFunctionId.get(id)
  if (existing) {
    for (const name of names) {
      existing.add(name)
    }
    return existing
  }
  const created = new Set(names)
  knownRootParamsByFunctionId.set(id, created)
  return created
}

function computeRootParamsCacheKeySuffix(
  rootParams: Params,
  paramNames: ReadonlySet<string>
): string {
  if (paramNames.size === 0) {
    return ''
  }

  return JSON.stringify(
    [...paramNames]
      .sort()
      .map((paramName) => [paramName, rootParams[paramName]])
  )
}

// Next-internal cookies that must not vary the private cache key, since they're
// not part of the application's own cookie state. The instant-navigation cookie
// toggles while a navigation lock is held, so including it would force spurious
// misses. The HMR refresh hash is already part of the cache key (see
// `cacheKeyParts`), so including its cookie too would just be redundant.
const COOKIES_EXCLUDED_FROM_PRIVATE_CACHE_KEY = new Set<string>([
  NEXT_HMR_REFRESH_HASH_COOKIE,
  NEXT_INSTANT_TEST_COOKIE,
])

// Request and transport headers that must not vary the private cache key. They
// either differ between otherwise-equivalent requests, which would cause
// spurious misses (a browser reload adds `cache-control`/`pragma` that an
// initial navigation doesn't, and `accept`/`sec-fetch-*` differ between an HTML
// navigation and an RSC or prefetch request for the same page), or are
// connection- and proxy-level rather than application data. The `cookie` header
// is excluded because cookies are keyed separately below (via the dedicated
// cookie path, which applies `COOKIES_EXCLUDED_FROM_PRIVATE_CACHE_KEY`);
// including the raw header would duplicate them and reintroduce the cookies
// that path excludes. Header names are lowercased by `HeadersAdapter`, so every
// entry here is lowercase.
const HEADERS_EXCLUDED_FROM_PRIVATE_CACHE_KEY = new Set<string>([
  'accept',
  'accept-encoding',
  'cache-control',
  'connection',
  'cookie',
  'if-match',
  'if-modified-since',
  'if-none-match',
  'if-range',
  'if-unmodified-since',
  'keep-alive',
  'pragma',
  'priority',
  'purpose',
  'range',
  'sec-fetch-dest',
  'sec-fetch-mode',
  'sec-fetch-site',
  'sec-fetch-user',
  'sec-purpose',
  'te',
  'upgrade',
  'upgrade-insecure-requests',
  'x-forwarded-for',
  'x-forwarded-host',
  'x-forwarded-port',
  'x-forwarded-proto',
])

// TODO: This varies the dev private cache key by the request's cookies and
// headers (minus the transport and content-negotiation headers excluded above).
// It's a heuristic: it still over-keys (a cache that reads only one cookie or
// header varies by all of them) and the header denylist is necessarily
// incomplete. Follow up by tracking which cookies and headers a cache function
// actually reads (the same mechanism root params use via `readRootParamNames`)
// and keying by only those. Note that Next-internal flight headers such as
// `rsc` and `next-router-state-tree` are already stripped upstream in
// `getHeaders`, so they never appear here.
function computePrivateCacheKeyRequestSuffix(
  cookies: ReadonlyRequestCookies,
  headers: ReadonlyHeaders
): string {
  const relevantCookies = cookies
    .getAll()
    .filter(
      (cookie) => !COOKIES_EXCLUDED_FROM_PRIVATE_CACHE_KEY.has(cookie.name)
    )
    .map((cookie): [string, string] => [cookie.name, cookie.value])
    .sort(([nameA], [nameB]) => (nameA < nameB ? -1 : nameA > nameB ? 1 : 0))

  const relevantHeaders = [...headers.entries()]
    .filter(([name]) => !HEADERS_EXCLUDED_FROM_PRIVATE_CACHE_KEY.has(name))
    .sort(([nameA], [nameB]) => (nameA < nameB ? -1 : nameA > nameB ? 1 : 0))

  if (relevantCookies.length === 0 && relevantHeaders.length === 0) {
    return ''
  }

  return JSON.stringify({ cookies: relevantCookies, headers: relevantHeaders })
}

function saveToResumeDataCache(
  resumeDataCache: ResumeDataCache | null,
  serializedCacheKey: string,
  pendingCacheResult: Promise<CollectedCacheResult>
): Promise<CollectedCacheResult> {
  if (!resumeDataCache?.mutable) {
    return pendingCacheResult
  }

  const split = clonePendingCacheResult(pendingCacheResult)
  const savedCacheResult = getNthCacheResult(split, 0)
  const rdcResult = getNthCacheResult(split, 1)

  // The RDC is per-page and root params are fixed within a page, so we always
  // use the coarse key (without root param suffix). Unlike the cache handler,
  // the RDC doesn't need root-param-specific keys for isolation.
  resumeDataCache.cache.set(serializedCacheKey, rdcResult)
  debug?.('Resume Data Cache entry saved', serializedCacheKey)

  return savedCacheResult
}

/**
 * A joiner's RDC context may differ from the leader's:
 *
 * - Intra-request: the leader was nested inside another cache (no accessible
 *   RDC) while this joiner is top-level and has one.
 * - Cross-request: the leader belongs to a different request entirely — this
 *   request's RDC has never seen the entry.
 *
 * In both cases the joiner must save to its own RDC so its final prerender can
 * resume from the entry. Constructs a `CollectedCacheResult` from a forked
 * stream branch of the shared entry and the awaited metadata.
 *
 * The `cache.has()` guard avoids redundant saves when the intra-request leader
 * already saved to the same RDC. Without it, this would needlessly tee the
 * stream and overwrite an equivalent RDC entry.
 */
function saveSharedCacheEntryToResumeDataCache(
  serializedCacheKey: string,
  sharedCacheEntry: SharedCacheEntry,
  resumeDataCache: ResumeDataCache | null
): void {
  if (
    !resumeDataCache?.mutable ||
    resumeDataCache.cache.has(serializedCacheKey)
  ) {
    return
  }

  const rdcResult: Promise<CollectedCacheResult> =
    sharedCacheEntry.pendingMetadata.then((metadata) => ({
      entry: {
        value: sharedCacheEntry.fork(),
        tags: metadata.tags,
        revalidate: metadata.revalidate,
        expire: metadata.expire,
        stale: metadata.stale,
        timestamp: metadata.timestamp,
      },
      readRootParamNames: metadata.readRootParamNames,
      hasExplicitRevalidate: metadata.hasExplicitRevalidate,
      hasExplicitExpire: metadata.hasExplicitExpire,
      dynamicNestedCacheError: metadata.dynamicNestedCacheError,
    }))

  resumeDataCache.cache.set(serializedCacheKey, rdcResult)
  debug?.('Resume Data Cache entry saved by joiner', serializedCacheKey)
}

function saveToCacheHandler(
  cacheHandler: CacheReadWriteHandler,
  workStore: WorkStore,
  id: string,
  cacheHandlerKeyBase: string,
  savedCacheResult: Promise<CollectedCacheResult>,
  rootParams: Params | undefined
): Promise<CollectedCacheResult> {
  // Write the entry to the cache handler. With root params, this is a redirect
  // entry at the coarse key plus the actual entry at the specific key;
  // otherwise just the entry at the coarse key. Both set calls are fired
  // together and awaited in parallel.
  const combinedSetPromise = savedCacheResult.then(async (collectedResult) => {
    const { entry: fullEntry, readRootParamNames } = collectedResult

    // Use the combined set (union of all historically observed reads) for both
    // the specific key and the redirect entry's tags. The read path computes
    // cacheHandlerKey from this same union (knownRootParamsByFunctionId), so
    // the write path must use the identical set to land on the same specific
    // key. If we used only the current invocation's reads, a function that
    // conditionally reads different root params across invocations would
    // scatter entries across different specific keys, making previous entries
    // unreachable from the read path's union-based lookup.
    const rootParamNames = readRootParamNames
      ? addKnownRootParamNames(id, readRootParamNames)
      : knownRootParamsByFunctionId.get(id)

    const setPromises: Promise<void>[] = []
    let coarseEntry: CacheEntry = fullEntry

    if (rootParamNames && rootParamNames.size > 0 && rootParams) {
      const specificKey =
        cacheHandlerKeyBase +
        computeRootParamsCacheKeySuffix(rootParams, rootParamNames)

      setPromises.push(
        cacheHandler.set(specificKey, Promise.resolve(fullEntry))
      )

      // The coarse key gets a redirect entry instead. On a cold server (empty
      // knownRootParamsByFunctionId), its tags tell a reader which root params
      // to include in the specific-key lookup.
      const rootParamTags = [...rootParamNames].map(
        (paramName) => NEXT_CACHE_ROOT_PARAM_TAG_ID + paramName
      )

      coarseEntry = {
        value: new ReadableStream({
          start(controller) {
            // Single byte so the entry has non-zero size in LRU caches.
            controller.enqueue(new Uint8Array([0]))
            controller.close()
          },
        }),
        tags: [...fullEntry.tags, ...rootParamTags],
        stale: fullEntry.stale,
        timestamp: fullEntry.timestamp,
        expire: fullEntry.expire,
        revalidate: fullEntry.revalidate,
      } satisfies CacheEntry
    }

    setPromises.push(
      cacheHandler.set(cacheHandlerKeyBase, Promise.resolve(coarseEntry))
    )

    await Promise.all(setPromises)
  })

  workStore.pendingRevalidateWrites ??= []
  workStore.pendingRevalidateWrites.push(combinedSetPromise)

  // A cross-request joiner reads its recomputed specific key only after it has
  // awaited this entry's metadata, so gate the metadata on the writes landing:
  // that guarantees the entry is present when the joiner re-reads. A failed
  // write shouldn't reject the metadata (the joiner just misses and
  // regenerates), so settle either way; a collection failure still propagates
  // through `savedCacheResult`.
  return combinedSetPromise.then(
    () => savedCacheResult,
    () => savedCacheResult
  )
}

function generateCacheEntry(
  workStore: WorkStore,
  cacheContext: CacheContext,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  encodedArguments: FormData | string,
  fn: (...args: unknown[]) => Promise<unknown>,
  timeoutError: UseCacheTimeoutError,
  deadlockError: UseCacheDeadlockError | undefined
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
    timeoutError,
    deadlockError
  )
}

function generateCacheEntryWithRestoredWorkStore(
  workStore: WorkStore,
  cacheContext: CacheContext,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  encodedArguments: FormData | string,
  fn: (...args: unknown[]) => Promise<unknown>,
  timeoutError: UseCacheTimeoutError,
  deadlockError: UseCacheDeadlockError | undefined
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
    timeoutError,
    deadlockError
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
      hmrRefreshHash: getHmrRefreshHash(outerWorkUnitStore),
      isHmrRefresh: isHmrRefresh(outerWorkUnitStore),
      serverComponentsHmrCache: getServerComponentsHmrCache(outerWorkUnitStore),
      forceRevalidate: shouldForceRevalidate(workStore, outerWorkUnitStore),
      draftMode: getDraftModeProviderForCacheScope(
        workStore,
        outerWorkUnitStore
      ),
      rootParams: outerWorkUnitStore.rootParams,
      readRootParamNames: process.env.__NEXT_DEV_SERVER ? new Set() : undefined,
      headers: outerWorkUnitStore.headers,
      cookies: outerWorkUnitStore.cookies,
      outerOwnerStack: cacheContext.outerOwnerStack,
    }
  } else {
    let useCacheOrRequestStore: RequestStore | UseCacheStore | undefined
    const outerWorkUnitStore = cacheContext.outerWorkUnitStore

    switch (outerWorkUnitStore.type) {
      case 'cache':
      case 'private-cache':
      case 'request':
        useCacheOrRequestStore = outerWorkUnitStore
        break
      case 'prerender-runtime':
      case 'prerender':
      case 'prerender-legacy':
      case 'unstable-cache':
      case 'generate-static-params':
        break
      default:
        outerWorkUnitStore satisfies never
    }

    return {
      type: 'cache',
      phase: 'render',
      implicitTags: outerWorkUnitStore.implicitTags,
      revalidate: defaultCacheLife.revalidate,
      expire: defaultCacheLife.expire,
      stale: defaultCacheLife.stale,
      explicitRevalidate: undefined,
      explicitExpire: undefined,
      explicitStale: undefined,
      tags: null,
      hmrRefreshHash: getHmrRefreshHash(outerWorkUnitStore),
      isHmrRefresh: useCacheOrRequestStore?.isHmrRefresh ?? false,
      serverComponentsHmrCache:
        useCacheOrRequestStore?.serverComponentsHmrCache,
      forceRevalidate: shouldForceRevalidate(workStore, outerWorkUnitStore),
      draftMode: getDraftModeProviderForCacheScope(
        workStore,
        outerWorkUnitStore
      ),
      rootParams: outerWorkUnitStore.rootParams,
      readRootParamNames: new Set<string>(),
      outerOwnerStack: cacheContext.outerOwnerStack,
      dynamicNestedCacheError: undefined,
    }
  }
}

/**
 * Captures the owner stack from the outer component tree before entering a
 * cache boundary. When nested inside another cache scope, the parent's
 * outerOwnerStack is concatenated so that the full component tree is preserved
 * across multiple cache boundaries.
 */
function captureOuterOwnerStack(
  workUnitStore: WorkUnitStore
): string | undefined {
  const capturedOwnerStack =
    (getClientReact()?.captureOwnerStack?.() ??
      getServerReact()?.captureOwnerStack?.()) ||
    ''

  let parentOuterOwnerStack: string | undefined
  switch (workUnitStore.type) {
    case 'cache':
    case 'private-cache':
      parentOuterOwnerStack = workUnitStore.outerOwnerStack
      break
    case 'unstable-cache':
    case 'request':
    case 'prerender':
    case 'prerender-legacy':
    case 'prerender-runtime':
    case 'prerender-client':
    case 'validation-client':
    case 'generate-static-params':
      break
    default:
      workUnitStore satisfies never
  }

  return capturedOwnerStack + (parentOuterOwnerStack || '') || undefined
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

// The maximum time we allow a `'use cache'` entry to fill. After this, we
// assume the fill is stalled — either on hanging input to the cached function,
// or on hanging I/O inside of it — and de-opt with an error.
//
// For prerender, the effective value is clamped to 90% of the configured
// `staticPageGenerationTimeout` so the cache-fill error surfaces before the
// build worker kills the page. In dev (`request`), the configured
// `experimental.useCacheTimeout` is used straight.
function getUseCacheFillTimeoutMs(
  workStore: WorkStore,
  workUnitStoreType: 'prerender' | 'prerender-runtime' | 'request'
): number {
  const { useCacheTimeout, staticPageGenerationTimeout } = workStore

  const effectiveTimeout =
    workUnitStoreType === 'request'
      ? useCacheTimeout
      : Math.min(useCacheTimeout, staticPageGenerationTimeout * 0.9)

  return effectiveTimeout * 1000
}

function generateCacheEntryWithCacheContext(
  workStore: WorkStore,
  cacheContext: CacheContext,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  encodedArguments: FormData | string,
  fn: (...args: unknown[]) => Promise<unknown>,
  timeoutError: UseCacheTimeoutError,
  deadlockError: UseCacheDeadlockError | undefined
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
      timeoutError,
      deadlockError
    )
  )
}

function propagateCacheLifeAndTagsToRevalidateStore(
  revalidateStore: RevalidateStore,
  metadata: CacheResultMetadata
): void {
  const outerTags = (revalidateStore.tags ??= [])

  for (const tag of metadata.tags) {
    if (!outerTags.includes(tag)) {
      outerTags.push(tag)
    }
  }

  if (revalidateStore.stale > metadata.stale) {
    revalidateStore.stale = metadata.stale
  }

  if (revalidateStore.revalidate > metadata.revalidate) {
    revalidateStore.revalidate = metadata.revalidate
  }

  if (revalidateStore.expire > metadata.expire) {
    revalidateStore.expire = metadata.expire
  }
}

function propagateCacheStaleTimeToRequestStore(
  requestStore: RequestStore,
  metadata: CacheResultMetadata
): void {
  if (requestStore.stale !== undefined && requestStore.stale > metadata.stale) {
    requestStore.stale = metadata.stale
  }
}

function propagateCacheEntryMetadata(
  cacheContext: CacheContext,
  metadata: CacheResultMetadata
): void {
  if (cacheContext.kind === 'private') {
    switch (cacheContext.outerWorkUnitStore.type) {
      case 'prerender-runtime':
      case 'private-cache':
        propagateCacheLifeAndTagsToRevalidateStore(
          cacheContext.outerWorkUnitStore,
          metadata
        )
        break
      case 'request':
        propagateCacheStaleTimeToRequestStore(
          cacheContext.outerWorkUnitStore,
          metadata
        )
        break
      case undefined:
        break
      default:
        cacheContext.outerWorkUnitStore satisfies never
    }
  } else {
    switch (cacheContext.outerWorkUnitStore.type) {
      case 'cache':
        if (metadata.readRootParamNames) {
          for (const paramName of metadata.readRootParamNames) {
            cacheContext.outerWorkUnitStore.readRootParamNames.add(paramName)
          }
        }
        // If this entry's cache life is dynamic, record this invocation as the
        // origin to use as `cause` when the outer cache surfaces the
        // nested-dynamic cache error. `??=` keeps the first occurrence so the
        // cause points at the immediate dynamic child.
        if (
          cacheContext.dynamicNestedCacheError !== undefined &&
          (metadata.revalidate === 0 || metadata.expire < DYNAMIC_EXPIRE)
        ) {
          cacheContext.outerWorkUnitStore.dynamicNestedCacheError ??=
            cacheContext.dynamicNestedCacheError
        }
      // fallthrough
      case 'private-cache':
      case 'prerender':
      case 'prerender-runtime':
      case 'prerender-legacy':
        propagateCacheLifeAndTagsToRevalidateStore(
          cacheContext.outerWorkUnitStore,
          metadata
        )
        break
      case 'request':
        propagateCacheStaleTimeToRequestStore(
          cacheContext.outerWorkUnitStore,
          metadata
        )
        break
      case 'unstable-cache':
      case 'generate-static-params':
        break
      default:
        cacheContext.outerWorkUnitStore satisfies never
    }
  }
}

/**
 * Conditionally propagates cache life, tags, and root param names to the outer
 * context. During prerenders (`prerender` / `prerender-runtime`) and dev
 * cache-filling requests, propagation is deferred because the entry might be
 * omitted from the final prerender due to short expire/stale times. If omitted,
 * it should not affect the prerender. The final decision happens when the entry
 * is read from the resume data cache in the final render phase — at that point
 * `propagateCacheEntryMetadata` is called unconditionally (after the omission
 * checks have already filtered out short-lived entries).
 *
 * Note: Root param names are only propagated when the outer context is a
 * `cache` store (i.e. an enclosing `"use cache"` function), which is never
 * deferred. For prerender contexts, root param names are tracked separately
 * via `addKnownRootParamNames` in the resume data cache read path.
 */
function maybePropagateCacheEntryMetadata(
  cacheContext: CacheContext,
  metadata: CacheResultMetadata
): void {
  const outerWorkUnitStore = cacheContext.outerWorkUnitStore

  switch (outerWorkUnitStore.type) {
    case 'prerender':
    case 'prerender-runtime': {
      // Don't propagate yet — the entry might be omitted from the final
      // prerender due to short expire/stale times. Propagation will happen when
      // the entry is read from the resume data cache.
      break
    }
    case 'request': {
      if (
        process.env.NODE_ENV === 'development' &&
        outerWorkUnitStore.cacheSignal
      ) {
        // If we're filling caches for a dev request, apply the same logic as
        // prerenders do above.
        break
      }
      // fallthrough
    }
    case 'private-cache':
    case 'cache':
    case 'unstable-cache':
    case 'prerender-legacy': {
      propagateCacheEntryMetadata(cacheContext, metadata)
      break
    }
    case 'generate-static-params':
      break
    default: {
      outerWorkUnitStore satisfies never
    }
  }
}

export interface CollectedCacheResult {
  entry: CacheEntry
  /**
   * Whether the revalidate value was explicitly set via `cacheLife()`.
   * - `true`: explicitly set
   * - `false`: implicit (propagated from a nested cache or implicitly using the
   *   default profile)
   * - `undefined`: unknown (e.g. pre-existing entry from a cache handler)
   */
  hasExplicitRevalidate: boolean | undefined
  /**
   * Whether the expire value was explicitly set via `cacheLife()`.
   * - `true`: explicitly set
   * - `false`: implicit (propagated from a nested cache or implicitly using the
   *   default profile)
   * - `undefined`: unknown (e.g. pre-existing entry from a cache handler)
   */
  hasExplicitExpire: boolean | undefined
  /**
   * The root param names that were read during cache entry generation.
   * Used to compute the specific cache key after generation completes.
   * `undefined` for pre-existing entries from cache handlers where we
   * don't have this information.
   */
  readRootParamNames: ReadonlySet<string> | undefined
  /**
   * The `Error` carried up from the first nested public `'use cache'`
   * invocation that propagated a dynamic cache life into this entry, captured
   * eagerly at that inner invocation's `cache()` entry. Used as `cause` for the
   * nested-dynamic cache error so the redbox can point at the inner invocation
   * site, not just the outer one. Lives in-memory only — intentionally dropped
   * from the serialized RDC because dynamic entries aren't serialized either.
   */
  dynamicNestedCacheError: Error | undefined
}

async function collectResult(
  savedStream: ReadableStream<Uint8Array>,
  workStore: WorkStore,
  cacheContext: CacheContext,
  innerCacheStore: UseCacheStore,
  startTime: number,
  errors: Array<unknown> // This is a live array that gets pushed into.
): Promise<CollectedCacheResult> {
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

  const isPrivateCacheInDev = Boolean(
    process.env.__NEXT_DEV_SERVER && cacheContext.kind === 'private'
  )

  // In development, force a dynamic cache life (`revalidate: 0`, `expire:
  // DYNAMIC_EXPIRE`) for private caches, which have no real backing handler.
  // The zero revalidate makes every read serve stale-while-revalidate
  // (regenerating a fresh entry in the background), and `DYNAMIC_EXPIRE` (5
  // minutes) caps how long an entry lingers in the dedicated in-memory private
  // handler. It is the shortest `expire` that isn't treated as dynamic; a
  // smaller `expire` would exclude the entry from prerenders. The size-0 case
  // (`cacheMaxMemorySize: 0`) deliberately does NOT force this: it keeps its
  // resolved cache life so that the cache entry can be considered prerenderable
  // instead of being misread as a dynamic hole, and a separate dev revalidation
  // (see the cache-hit path below) keeps its reloads showing a fresh value.
  // Custom kinds keep their real cache life too, since their backing handler
  // owns it.
  const forceDynamicCacheLifeInDev = isPrivateCacheInDev

  // If cacheLife() was used to set an explicit revalidate/expire/stale time we
  // use that. Otherwise, we use the lowest of all inner fetch(),
  // unstable_cache() or nested "use cache", if they're lower than our default.
  const collectedRevalidate = forceDynamicCacheLifeInDev
    ? 0
    : innerCacheStore.explicitRevalidate !== undefined
      ? innerCacheStore.explicitRevalidate
      : innerCacheStore.revalidate
  const collectedExpire = forceDynamicCacheLifeInDev
    ? DYNAMIC_EXPIRE
    : innerCacheStore.explicitExpire !== undefined
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

  const collected: CollectedCacheResult = {
    entry,
    hasExplicitRevalidate: innerCacheStore.explicitRevalidate !== undefined,
    hasExplicitExpire: innerCacheStore.explicitExpire !== undefined,
    readRootParamNames:
      innerCacheStore.type === 'cache' || isPrivateCacheInDev
        ? innerCacheStore.readRootParamNames
        : undefined,
    // The store accumulates this from nested public caches that propagated a
    // dynamic life into us.
    dynamicNestedCacheError:
      innerCacheStore.type === 'cache'
        ? innerCacheStore.dynamicNestedCacheError
        : undefined,
  }

  if (!cacheContext.skipPropagation) {
    maybePropagateCacheEntryMetadata(cacheContext, {
      tags: collected.entry.tags,
      revalidate: collected.entry.revalidate,
      expire: collected.entry.expire,
      stale: collected.entry.stale,
      timestamp: collected.entry.timestamp,
      hasExplicitRevalidate: collected.hasExplicitRevalidate,
      hasExplicitExpire: collected.hasExplicitExpire,
      readRootParamNames: collected.readRootParamNames,
      dynamicNestedCacheError: collected.dynamicNestedCacheError,
    })

    const cacheSignal = getCacheSignal(cacheContext.outerWorkUnitStore)
    if (cacheSignal) {
      cacheSignal.endRead()
    }
  }

  return collected
}

type GenerateCacheEntryResult =
  | {
      readonly type: 'cached'
      readonly stream: ReadableStream
      readonly pendingCacheResult: Promise<CollectedCacheResult>
    }
  | {
      readonly type: 'prerender-dynamic'
      readonly hangingPromise: Promise<never>
    }

async function generateCacheEntryImpl(
  workStore: WorkStore,
  cacheContext: CacheContext,
  innerCacheStore: UseCacheStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  encodedArguments: FormData | string,
  fn: (...args: unknown[]) => Promise<unknown>,
  timeoutError: UseCacheTimeoutError,
  deadlockError: UseCacheDeadlockError | undefined
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

              switch (outerWorkUnitStore.type) {
                case 'prerender-runtime':
                case 'prerender':
                  // The encoded arguments might contain hanging promises. In
                  // this case we don't want to reject with "Error: Connection
                  // closed.", so we intentionally keep the iterable alive. This
                  // is similar to the halting trick that we do while rendering.
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
                case 'prerender-legacy':
                case 'request':
                case 'cache':
                case 'private-cache':
                case 'unstable-cache':
                case 'generate-static-params':
                  break
                default:
                  outerWorkUnitStore satisfies never
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
  const resultPromise = createLazyResult(fn.bind(null, ...args))

  const errors: Array<unknown> = []

  // In the "Cache" environment, we only need to make sure that the error
  // digests are handled correctly. Error formatting and reporting is not
  // necessary here; the errors are encoded in the stream, and will be reported
  // in the "Server" environment.
  const handleError = createReactServerErrorHandler(
    process.env.NODE_ENV === 'development',
    workStore.isBuildTimePrerendering ?? false,
    workStore.reactServerErrorsByDigest,
    (error) => {
      // In production, we log the original error here. It gets a digest that
      // can be used to associate the error with the obfuscated error that might
      // be logged if the error is caught. In development, we prefer logging the
      // transported error in the server environment. It's not obfuscated and
      // also includes the (dev-only) environment name.
      if (process.env.NODE_ENV === 'production') {
        Log.error(error)
      }

      errors.push(error)
    }
  )

  let stream: ReadableStream<Uint8Array>
  let devTimeoutAbortController: AbortController | undefined

  switch (outerWorkUnitStore.type) {
    case 'prerender-runtime':
    case 'prerender':
      const timeoutAbortController = new AbortController()
      const timer = setTimeout(
        () => {
          workStore.invalidDynamicUsageError = timeoutError
          timeoutAbortController.abort(timeoutError)
        },
        getUseCacheFillTimeoutMs(workStore, outerWorkUnitStore.type)
      )

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
          'dynamic "use cache"'
        )

        if (outerWorkUnitStore.cacheSignal) {
          outerWorkUnitStore.cacheSignal.endRead()
        }

        return { type: 'prerender-dynamic', hangingPromise }
      } else {
        stream = prelude
      }
      break
    case 'request':
      // TODO: We should just check if the render is abandonable. This is
      // relevant in restart-on-cache-miss in general, so when we implement that
      // for cached navs, it'll also be needed in prod
      if (process.env.__NEXT_DEV_SERVER && outerWorkUnitStore.cacheSignal) {
        const stagedRendering = outerWorkUnitStore.stagedRendering

        // Capture the render stage at the start of this cache read, before the
        // yield below. A streamed staged render advances its controller on its
        // own schedule, independently of this read, so by the time the yield
        // resolves the controller may have raced ahead to the Dynamic stage even
        // though the read began in an earlier (prerender) stage.
        const stageAtReadStart = stagedRendering?.currentStage

        // If we're filling caches for a staged render, make sure that it takes
        // at least a task, so we'll always notice a cache miss between stages.
        //
        // TODO(restart-on-cache-miss): This is suboptimal. Ideally microtasky
        // caches wouldn't register as a miss, but short-lived caches are only
        // omitted correctly when read back in a separate render (now the
        // background validation render, not a restart of the streamed
        // response), so forcing the miss is the best we can do until that's
        // refactored.
        await new Promise((resolve) => setTimeout(resolve))

        // Start a cache-fill timeout so a hanging `'use cache'` entry surfaces
        // the same error in dev as during prerender. Cleared when
        // pendingCacheResult settles.
        //
        // Skip the timeout only when the read began in the Dynamic stage, which
        // mirrors prerender: a cache guarded by e.g. `await connection()` is a
        // legitimate dynamic hole and isn't executed there. We use the stage
        // captured at read start, not the current one, because the staged render
        // may have advanced past it during the yield above.
        if (stageAtReadStart !== RenderStage.Dynamic) {
          const devRenderAbortController = new AbortController()
          const fillTimeoutMs = getUseCacheFillTimeoutMs(
            workStore,
            outerWorkUnitStore.type
          )
          const fillDeadlineAt = performance.now() + fillTimeoutMs
          const devRenderTimeoutTimer = setTimeout(() => {
            workStore.invalidDynamicUsageError = timeoutError
            devRenderAbortController.abort(timeoutError)
          }, fillTimeoutMs)

          devTimeoutAbortController = new AbortController()
          devTimeoutAbortController.signal.addEventListener(
            'abort',
            () => {
              clearTimeout(devRenderTimeoutTimer)
            },
            { once: true }
          )

          stream = renderToReadableStream(
            resultPromise,
            clientReferenceManifest.clientModules,
            {
              environmentName: 'Cache',
              filterStackFrame,
              signal: devRenderAbortController.signal,
              temporaryReferences,
              onError(error) {
                if (
                  devRenderAbortController.signal.aborted &&
                  devRenderAbortController.signal.reason === error &&
                  error instanceof Error
                ) {
                  // The abort reason is the same error stored as
                  // `workStore.invalidDynamicUsageError` (a fill timeout or
                  // deadlock). Register it under a digest and return that
                  // digest, so the error that surfaces on the consumer side of
                  // this Flight boundary carries it and the outer render's
                  // handler can recover *this* object via
                  // `reactServerErrorsByDigest`.
                  //
                  // We deliberately do not set `error.digest` here: whether the
                  // error actually surfaces (vs. being caught in userland) is
                  // the consumer's decision, so the "surfaced" mark is left to
                  // the outer handler.
                  const digest = createDigestWithErrorCode(
                    error,
                    stringHash(error.message + (error.stack || '')).toString()
                  )

                  workStore.reactServerErrorsByDigest.set(
                    digest,
                    error as DigestedError
                  )

                  return digest
                }

                return handleError(error)
              },
            }
          )

          // `require` (rather than a top-level import) so the bundler can
          // tree-shake the probe scheduler out of the production runtime, where
          // this whole dev-server-gated branch is dead code.
          const { setupProbeScheduler } =
            require('./use-cache-probe-scheduler') as typeof import('./use-cache-probe-scheduler')
          stream = setupProbeScheduler({
            workStore,
            outerRequestStore: outerWorkUnitStore,
            cacheContext,
            encodedArguments,
            fillDeadlineAt,
            stream,
            abortSignal: AbortSignal.any([
              devRenderAbortController.signal,
              devTimeoutAbortController.signal,
            ]),
            onProbeCompleted() {
              const error =
                deadlockError ??
                new InvariantError(
                  '`deadlockError` should be constructed inside `cache()` before reaching the probe scheduler.'
                )
              workStore.invalidDynamicUsageError = error
              devRenderAbortController.abort(error)
            },
          })
          break
        }
      }
    // fallthrough
    case 'prerender-legacy':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'generate-static-params':
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

  const pendingCacheResult = collectResult(
    savedStream,
    workStore,
    cacheContext,
    innerCacheStore,
    startTime,
    errors
  ).finally(() => {
    devTimeoutAbortController?.abort()
  })

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
    pendingCacheResult,
  }
}

function cloneCacheResult(
  result: CollectedCacheResult
): [CollectedCacheResult, CollectedCacheResult] {
  const [entryA, entryB] = cloneCacheEntry(result.entry)
  return [
    {
      entry: entryA,
      hasExplicitRevalidate: result.hasExplicitRevalidate,
      hasExplicitExpire: result.hasExplicitExpire,
      readRootParamNames: result.readRootParamNames,
      dynamicNestedCacheError: result.dynamicNestedCacheError,
    },
    {
      entry: entryB,
      hasExplicitRevalidate: result.hasExplicitRevalidate,
      hasExplicitExpire: result.hasExplicitExpire,
      readRootParamNames: result.readRootParamNames,
      dynamicNestedCacheError: result.dynamicNestedCacheError,
    },
  ]
}

async function clonePendingCacheResult(
  pendingCacheResult: Promise<CollectedCacheResult>
): Promise<[CollectedCacheResult, CollectedCacheResult]> {
  const result = await pendingCacheResult
  return cloneCacheResult(result)
}

async function getNthCacheResult(
  split: Promise<[CollectedCacheResult, CollectedCacheResult]>,
  i: number
): Promise<CollectedCacheResult> {
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

export async function cache(
  kind: string,
  id: string,
  boundArgsLength: number,
  originalFn: (...args: unknown[]) => Promise<unknown>,
  args: unknown[]
) {
  const isPrivate = kind === 'private'

  const workStore = workAsyncStorage.getStore()
  if (workStore === undefined) {
    throw new Error(
      '"use cache" cannot be used outside of App Router. Expected a WorkStore.'
    )
  }

  // Probe re-executions (the dev-server's hang-detection worker) short-circuit
  // further down before any handler is consulted, so we skip handler selection
  // entirely and the worker can boot without registering handlers at all.
  let cacheHandler: CacheReadWriteHandler | undefined
  if (workStore.useCacheProbeMode === undefined) {
    if (isPrivate) {
      // Private caches normally go to the Resume Data Cache (RDC), not a cache
      // handler. In development we additionally persist them in a dedicated
      // built-in in-memory handler so that warm reloads are fast.
      if (process.env.__NEXT_DEV_SERVER) {
        cacheHandler = getPrivateCacheHandler()
      }
    } else {
      const handler = getCacheHandler(kind)
      if (!handler) {
        throw new Error('Unknown cache handler: ' + kind)
      }

      // In development, a user-configured (custom) handler may be slow or
      // remote, so we read through a tiered handler that puts a built-in
      // in-memory front in front of it to keep warm reads microtask-fast.
      // Built-in handlers (the default handler, and its size-0 replacement) are
      // already in-memory and used directly.
      if (process.env.__NEXT_DEV_SERVER && isCustomCacheHandler(kind)) {
        // A custom kind always has a dev tiered handler: it is created in the
        // same `setCacheHandler` call that makes `isCustomCacheHandler` true.
        const tieredCacheHandler = getDevTieredCacheHandler(kind)

        if (!tieredCacheHandler) {
          throw new InvariantError(
            `Expected a dev tiered cache handler for kind "${kind}".`
          )
        }

        cacheHandler = tieredCacheHandler
      } else {
        cacheHandler = handler
      }
    }
  }

  const timeoutError = new UseCacheTimeoutError()
  Error.captureStackTrace(timeoutError, cache)
  applyOwnerStack(timeoutError)

  // Only ever thrown by the dev-server's hang-detection probe.
  // `Error.captureStackTrace` has to run while `cache()` is still on the
  // synchronous stack, otherwise the user's `'use cache'` invocation frames
  // would already be gone — that's why the construction sits up here rather
  // than next to the trigger that actually consumes it. The `__NEXT_DEV_SERVER`
  // gate lets the error class drop out of the production runtime bundle.
  let deadlockError: UseCacheDeadlockError | undefined
  if (process.env.__NEXT_DEV_SERVER) {
    deadlockError = new UseCacheDeadlockError()
    Error.captureStackTrace(deadlockError, cache)
    applyOwnerStack(deadlockError)
  }

  const wrapAsInvalidDynamicUsageError = (error: Error) => {
    Error.captureStackTrace(error, cache)
    workStore.invalidDynamicUsageError ??= error

    return error
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore === undefined) {
    throw new InvariantError(
      '"use cache" cannot be used outside of App Router. Expected a WorkUnitStore.'
    )
  }

  const outerOwnerStack =
    process.env.NODE_ENV !== 'production'
      ? captureOuterOwnerStack(workUnitStore)
      : undefined

  const name = originalFn.name
  let fn = originalFn
  let cacheContext: CacheContext

  if (isPrivate) {
    const expression = '"use cache: private"'

    switch (workUnitStore.type) {
      // "use cache: private" is dynamic in prerendering contexts.
      case 'prerender':
        return makeHangingPromise(
          workUnitStore.renderSignal,
          workStore.route,
          expression
        )
      case 'prerender-legacy':
        return throwToInterruptStaticGeneration(
          expression,
          workStore,
          workUnitStore
        )
      case 'prerender-client':
      case 'validation-client':
        throw new InvariantError(
          `${expression} must not be used within a client component. Next.js should be preventing ${expression} from being allowed in client components statically, but did not in this case.`
        )
      case 'unstable-cache': {
        throw wrapAsInvalidDynamicUsageError(
          new Error(
            // TODO: Add a link to an error documentation page when we have one.
            `${expression} must not be used within \`unstable_cache()\`.`
          )
        )
      }
      case 'cache': {
        throw wrapAsInvalidDynamicUsageError(
          new Error(
            // TODO: Add a link to an error documentation page when we have one.
            `${expression} must not be used within "use cache". It can only be nested inside of another ${expression}.`
          )
        )
      }
      case 'request':
      case 'prerender-runtime':
      case 'private-cache':
        cacheContext = {
          kind: 'private',
          outerWorkUnitStore: workUnitStore,
          skipPropagation: false,
          outerOwnerStack,
          functionId: id,
          handlerKind: kind,
        }
        break
      case 'generate-static-params':
        throw wrapAsInvalidDynamicUsageError(
          new Error(
            // TODO: Add a link to an error documentation page when we have one.
            `${expression} cannot be used outside of a request context.`
          )
        )
      default:
        workUnitStore satisfies never
        // This is dead code, but without throwing an error here, TypeScript
        // will assume that cacheContext is used before being assigned.
        throw new InvariantError(`Unexpected work unit store.`)
    }
  } else {
    switch (workUnitStore.type) {
      case 'prerender-client':
      case 'validation-client':
        const expression = '"use cache"'
        throw new InvariantError(
          `${expression} must not be used within a client component. Next.js should be preventing ${expression} from being allowed in client components statically, but did not in this case.`
        )
      case 'cache': {
        // Eagerly capture this invocation's call site while still synchronous
        // in `cache()`. Used as `cause` of the nested-dynamic cache error
        // when the outer cache (whose body never re-runs during the final
        // prerender) throws. Only constructed when the parent is itself a
        // public `'use cache'` — otherwise this entry can never propagate
        // dynamism into that error and the allocation would be wasted. Private
        // parents are intentionally excluded: `'use cache: private'` is
        // dynamic-by-definition in prerendering and deferred to the runtime
        // stage in dev requests, so a public cache nested inside one never
        // triggers the throw upstream.
        const dynamicNestedCacheError = new NestedDynamicUseCacheError()
        Error.captureStackTrace(dynamicNestedCacheError, cache)
        applyOwnerStack(dynamicNestedCacheError)
        cacheContext = {
          kind: 'public',
          outerWorkUnitStore: workUnitStore,
          skipPropagation: false,
          outerOwnerStack,
          functionId: id,
          handlerKind: kind,
          dynamicNestedCacheError,
        }
        break
      }
      case 'prerender':
      case 'prerender-runtime':
      case 'prerender-legacy':
      case 'request':
      case 'private-cache':
      // TODO: We should probably forbid nesting "use cache" inside
      // unstable_cache. (fallthrough)
      case 'unstable-cache':
      case 'generate-static-params':
        cacheContext = {
          kind: 'public',
          outerWorkUnitStore: workUnitStore,
          skipPropagation: false,
          outerOwnerStack,
          functionId: id,
          handlerKind: kind,
          dynamicNestedCacheError: undefined,
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
  const clientReferenceManifest = getClientReferenceManifest()

  // Because the Action ID is not yet unique per implementation of that Action we can't
  // safely reuse the results across builds yet. In the meantime we add the buildId to the
  // arguments as a seed to ensure they're not reused. Remove this once Action IDs hash
  // the implementation.
  const buildId = workStore.deploymentId || workStore.buildId

  // In dev mode, when the HMR refresh hash is set, we include it in the
  // cache key. This ensures that cache entries are not reused when server
  // components have been edited. This is a very coarse approach. But it's
  // also only a temporary solution until Action IDs are unique per
  // implementation. Remove this once Action IDs hash the implementation.
  const hmrRefreshHash = getHmrRefreshHash(workUnitStore)

  const hangingInputAbortSignal = createHangingInputAbortSignal(workUnitStore)

  if (cacheContext.kind === 'private') {
    const { outerWorkUnitStore } = cacheContext
    switch (outerWorkUnitStore.type) {
      case 'prerender-runtime': {
        // In a runtime prerender, we have to make sure that APIs that would hang during a static prerender
        // are resolved with a delay, in the appropriate runtime stage. Private caches read from
        // Segments not using runtime prefetch resolve at EarlyRuntime,
        // while runtime-prefetchable segments resolve at Runtime.
        const stagedRendering = outerWorkUnitStore.stagedRendering
        if (stagedRendering) {
          await stagedRendering.waitForStage(
            // TODO(app-shells): exclude private caches with a short staletime from shells
            getSessionDataStage(stagedRendering)
          )
        }
        break
      }
      case 'request': {
        if (process.env.NODE_ENV === 'development') {
          // Similar to runtime prerenders, private caches should not resolve in the static stage
          // of a dev request, so we delay them. We pick the appropriate runtime stage based on
          // whether we're in the early or late stages.
          const stagedRendering = outerWorkUnitStore.stagedRendering
          const stage = stagedRendering
            ? // TODO(app-shells): exclude private caches with a short staletime
              getSessionDataStage(stagedRendering)
            : RenderStage.Runtime
          await makeDevtoolsIOAwarePromise(undefined, outerWorkUnitStore, stage)
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
              makeErroringSearchParamsForUseCache(),
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

    const encryptedBoundArgs = args.shift() as Promise<string>
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

  // The base serialized cache key doesn't include the cookies or headers that
  // private caches are allowed to read. In production this is because private
  // cache entries aren't stored in a cache handler, only in the Resume Data
  // Cache (RDC): private caches are only used during dynamic requests and
  // runtime prefetches; for dynamic requests the RDC is immutable and excludes
  // private caches, and for runtime prefetches it's mutable but lives only as
  // long as the request. In development private caches are persisted across
  // requests, so `cacheHandlerKeyBase` (below) additionally scopes the handler
  // key by the request's cookies and headers.
  const cacheKeyParts: CacheKeyParts = hmrRefreshHash
    ? [buildId, id, args, hmrRefreshHash]
    : [buildId, id, args]

  const encodeCacheKeyParts = () =>
    encodeReply(cacheKeyParts, {
      temporaryReferences,
      signal: hangingInputAbortSignal,
    })

  let encodedCacheKeyParts: FormData | string

  switch (workUnitStore.type) {
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
            'dynamic "use cache"'
          )
        }
        break
      }
    // fallthrough
    case 'prerender-legacy':
    case 'request':
    // TODO(restart-on-cache-miss): We need to handle params/searchParams on page components.
    // the promises will be tasky, so `encodeCacheKeyParts` will not resolve in the static stage.
    // We have not started a cache read at this point, so we might just miss the cache completely.
    // fallthrough
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'generate-static-params':
    case undefined:
      encodedCacheKeyParts = await encodeCacheKeyParts()
      break
    default:
      return workUnitStore satisfies never
  }

  // Probe path: we're running inside a pooled worker spawned by the dev
  // server to check whether a stalled cache fill would complete in an
  // isolated module scope. Skip the RDC / cache-handler / leader-election
  // machinery, call `generateCacheEntry` (same as a real cold fill), drain
  // the returned stream via `pendingCacheResult`, and apply the probe's own
  // timeout. The caller only cares whether the fill resolves; the result
  // value is discarded.
  //
  // Gated on `__NEXT_DEV_SERVER` so the entire branch — including its
  // `generateCacheEntry` call site and the threading of
  // `deadlockError` — drops out of the production runtime
  // bundle.
  if (process.env.__NEXT_DEV_SERVER && workStore.useCacheProbeMode) {
    // Both public and private caches probe via the same path. The worker
    // reconstructs real `headers` / `cookies` / `draftMode` from the
    // forwarded request snapshot, so private caches that legitimately read
    // those work in the probe just like in the real fill.
    const probeTimeoutMs = workStore.useCacheProbeMode.timeoutMs
    // The deadlock error never gets thrown from inside the worker: the
    // worker's outer store has `cacheSignal: undefined`, so
    // `generateCacheEntryImpl` skips the dev-request branch and the idle
    // probe is never set up.
    const result = await generateCacheEntry(
      workStore,
      cacheContext,
      clientReferenceManifest,
      encodedCacheKeyParts,
      fn,
      timeoutError,
      undefined
    )
    if (result.type === 'prerender-dynamic') {
      // Unreachable in the probe: outer store is `'request'`-typed, which
      // never produces this variant.
      throw new InvariantError(
        'Unexpected `prerender-dynamic` result in `use cache` probe mode.'
      )
    }
    // We don't consume the returned stream — `pendingCacheResult` is what
    // completes when `collectResult` has drained `savedStream`. Cancel the
    // unused copy so it doesn't buffer forever.
    result.stream.cancel().catch(() => {})
    let probeTimeoutTimer: ReturnType<typeof setTimeout> | undefined
    try {
      await Promise.race([
        result.pendingCacheResult,
        new Promise<never>((_, reject) => {
          probeTimeoutTimer = setTimeout(
            () => reject(timeoutError),
            probeTimeoutMs
          )
        }),
      ])
    } finally {
      if (probeTimeoutTimer !== undefined) {
        clearTimeout(probeTimeoutTimer)
      }
    }
    return
  }

  const serializedCacheKey =
    typeof encodedCacheKeyParts === 'string'
      ? // Fast path for the simple case for simple inputs. We let the CacheHandler
        // Convert it to an ArrayBuffer if it wants to.
        encodedCacheKeyParts
      : await encodeFormData(encodedCacheKeyParts)

  const rootParams = workUnitStore.rootParams
  const knownRootParamNames = knownRootParamsByFunctionId.get(id)

  // The coarse cache-handler key. With no root params read, it locates the
  // entry directly; otherwise it locates a redirect entry from which the
  // specific key (this key + root params, computed below) is derived. For
  // private caches in development (persisted in the built-in in-memory handler)
  // it's additionally scoped by the request's cookies and headers, so entries
  // for requests with different request data don't collide; keys derived from
  // it inherit that scoping.
  const cacheHandlerKeyBase =
    process.env.__NEXT_DEV_SERVER && cacheContext.kind === 'private'
      ? serializedCacheKey +
        computePrivateCacheKeyRequestSuffix(
          cacheContext.outerWorkUnitStore.cookies,
          cacheContext.outerWorkUnitStore.headers
        )
      : serializedCacheKey
  // If we already know which root params this function reads, include them in
  // the cache handler key for a direct hit (skipping the redirect entry).
  // rootParams is undefined when nested inside unstable_cache.
  let cacheHandlerKey =
    knownRootParamNames && rootParams
      ? cacheHandlerKeyBase +
        computeRootParamsCacheKeySuffix(rootParams, knownRootParamNames)
      : cacheHandlerKeyBase

  let stream: undefined | ReadableStream = undefined

  // Set when a short-lived warm hit ends its cache read up front (dev only) so
  // the static-shell boundary doesn't count it as a phantom miss. Once set, the
  // cache signal read is balanced, so serving must use a plain stream and skip
  // any trailing cacheSignal.endRead() call.
  let cacheSignalReadEnded = false

  const resumeDataCache = getResumeDataCache(workUnitStore)

  const implicitTags = workUnitStore.implicitTags?.tags ?? []

  if (resumeDataCache) {
    // If this cache key was already determined to be dynamic during the
    // prospective prerender (e.g. because it accessed fallback params), we
    // return a hanging promise early to avoid trying to regenerate the entry,
    // which would be aborted anyway.
    if (resumeDataCache.dynamicCacheKeys?.has(serializedCacheKey)) {
      switch (workUnitStore.type) {
        case 'prerender':
        case 'prerender-runtime':
          return makeHangingPromise(
            workUnitStore.renderSignal,
            workStore.route,
            'dynamic "use cache"'
          )
        case 'prerender-legacy':
        case 'request':
        case 'cache':
        case 'private-cache':
        case 'unstable-cache':
        case 'generate-static-params':
          break
        default:
          workUnitStore satisfies never
      }
    }

    const cacheSignal = getCacheSignal(workUnitStore)

    if (cacheSignal) {
      cacheSignal.beginRead()
    }
    const rdcEntry = resumeDataCache.cache.get(serializedCacheKey)
    if (rdcEntry !== undefined) {
      let rdcResult: CollectedCacheResult | undefined = await rdcEntry

      // Check if the RDC entry should be discarded due to recently revalidated
      // tags. When a server action calls updateTag(), the re-render should see
      // fresh data instead of stale RDC data.
      if (rdcResult !== undefined) {
        if (
          rdcResult.entry.tags.some((tag) =>
            isRecentlyRevalidatedTag(tag, workStore)
          ) ||
          implicitTags.some((tag) => isRecentlyRevalidatedTag(tag, workStore))
        ) {
          debug?.(
            'discarding RDC entry due to recently revalidated tags',
            serializedCacheKey
          )
          rdcResult = undefined
        }
      }

      if (rdcResult !== undefined) {
        if (
          rdcResult.entry.revalidate === 0 ||
          rdcResult.entry.expire < DYNAMIC_EXPIRE
        ) {
          switch (workUnitStore.type) {
            case 'prerender':
              // In a Dynamic I/O prerender, if the cache entry has
              // revalidate: 0 or if the expire time is under 5 minutes,
              // then we consider this cache entry dynamic as it's not worth
              // generating static pages for such data. It's better to leave
              // a dynamic hole that can be filled in during the resume with
              // a potentially cached entry.
              if (rdcResult.entry.revalidate === 0) {
                if (rdcResult.hasExplicitRevalidate === false) {
                  throw wrapAsInvalidDynamicUsageError(
                    new Error(nestedCacheZeroRevalidateErrorMessage, {
                      cause: rdcResult.dynamicNestedCacheError,
                    })
                  )
                }
                debug?.(
                  'omitting entry',
                  serializedCacheKey,
                  'from static shell due to revalidate: 0'
                )
              } else {
                if (rdcResult.hasExplicitExpire === false) {
                  throw wrapAsInvalidDynamicUsageError(
                    new Error(nestedCacheShortExpireErrorMessage, {
                      cause: rdcResult.dynamicNestedCacheError,
                    })
                  )
                }
                debug?.(
                  'omitting entry',
                  serializedCacheKey,
                  'from static shell due to short expire value:',
                  rdcResult.entry.expire
                )
              }
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
              // are resolved with a delay, in the appropriate runtime stage.
              const stagedRendering = workUnitStore.stagedRendering
              if (stagedRendering) {
                await stagedRendering.waitForStage(
                  // TODO(app-shells): exclude caches with a short staletime
                  getSessionDataStage(stagedRendering)
                )
              }
              break
            }
            case 'request': {
              if (process.env.NODE_ENV === 'development') {
                // These throws force the user to make an explicit cache life
                // decision on an outer cache that an inner cache would
                // otherwise silently shorten. A dev private cache's
                // `revalidate` is forced to 0 by us (not by a nested cache), so
                // it's excluded from the first throw to avoid a false positive.
                // Its forced `expire` is exactly DYNAMIC_EXPIRE, so it never
                // trips the second throw and needs no exclusion there.
                if (
                  cacheContext.kind !== 'private' &&
                  rdcResult.entry.revalidate === 0 &&
                  rdcResult.hasExplicitRevalidate === false
                ) {
                  throw wrapAsInvalidDynamicUsageError(
                    new Error(nestedCacheZeroRevalidateErrorMessage, {
                      cause: rdcResult.dynamicNestedCacheError,
                    })
                  )
                }
                if (
                  rdcResult.entry.expire < DYNAMIC_EXPIRE &&
                  rdcResult.hasExplicitExpire === false
                ) {
                  throw wrapAsInvalidDynamicUsageError(
                    new Error(nestedCacheShortExpireErrorMessage, {
                      cause: rdcResult.dynamicNestedCacheError,
                    })
                  )
                }
                // A short-lived entry is a dynamic hole, excluded from the
                // static shell, so we end the cache signal read here (the
                // prerender case does the same) to avoid this cache hit being
                // considered a cache miss when checking for pending cache reads
                // at staged rendering task boundaries. The value is deferred to
                // the runtime stage.
                if (cacheSignal && !cacheSignalReadEnded) {
                  cacheSignal.endRead()
                  cacheSignalReadEnded = true
                }

                const stagedRendering = workUnitStore.stagedRendering
                const stage = stagedRendering
                  ? getSessionDataStage(stagedRendering)
                  : RenderStage.Runtime
                await makeDevtoolsIOAwarePromise(
                  undefined,
                  workUnitStore,
                  stage
                )
              }
              break
            }
            case 'prerender-legacy':
            case 'cache':
            case 'private-cache':
            case 'unstable-cache':
            case 'generate-static-params':
              break
            default:
              workUnitStore satisfies never
          }
        }

        if (rdcResult.entry.stale < DYNAMIC_STALE) {
          switch (workUnitStore.type) {
            case 'prerender':
            case 'prerender-runtime':
              // If the cache entry will become
              // stale in less then 30 seconds, we consider this cache entry
              // dynamic as it's not worth prefetching. It's better to leave
              // a dynamic hole that can be filled during the navigation.
              debug?.(
                'omitting entry',
                serializedCacheKey,
                'from shell due to short stale value:',
                rdcResult.entry.stale
              )
              if (cacheSignal) {
                cacheSignal.endRead()
              }
              return makeHangingPromise(
                workUnitStore.renderSignal,
                workStore.route,
                'dynamic "use cache"'
              )
            case 'request': {
              // A short stale time excludes the entry from prerenders.
              // We delay it here to match that.
              if (process.env.NODE_ENV === 'development') {
                // End the cache signal read (once, in case the expire block
                // above already did) so the deferred value isn't counted as a
                // pending read at a staged rendering boundary, then defer it to
                // the dynamic stage.
                if (cacheSignal && !cacheSignalReadEnded) {
                  cacheSignal.endRead()
                  cacheSignalReadEnded = true
                }
                await makeDevtoolsIOAwarePromise(
                  undefined,
                  workUnitStore,
                  RenderStage.Dynamic
                )
              }
              break
            }
            case 'prerender-legacy':
            case 'cache':
            case 'private-cache':
            case 'unstable-cache':
            case 'generate-static-params':
              break
            default:
              workUnitStore satisfies never
          }
        }
      }

      if (rdcResult !== undefined) {
        debug?.('Resume Data Cache entry found', serializedCacheKey)

        if (
          rdcResult.readRootParamNames &&
          rdcResult.readRootParamNames.size > 0
        ) {
          addKnownRootParamNames(id, rdcResult.readRootParamNames)
        }

        // We want to make sure we only propagate cache life & tags if the
        // entry was *not* omitted from the prerender. So we only do this
        // after the above early returns.
        propagateCacheEntryMetadata(cacheContext, {
          tags: rdcResult.entry.tags,
          revalidate: rdcResult.entry.revalidate,
          expire: rdcResult.entry.expire,
          stale: rdcResult.entry.stale,
          timestamp: rdcResult.entry.timestamp,
          hasExplicitRevalidate: rdcResult.hasExplicitRevalidate,
          hasExplicitExpire: rdcResult.hasExplicitExpire,
          readRootParamNames: rdcResult.readRootParamNames,
          dynamicNestedCacheError: rdcResult.dynamicNestedCacheError,
        })

        const [streamA, streamB] = rdcResult.entry.value.tee()
        rdcResult.entry.value = streamB

        if (cacheSignal && !cacheSignalReadEnded) {
          // When we have a cacheSignal we need to block on reading the cache
          // entry before ending the read.
          stream = createTrackedReadableStream(streamA, cacheSignal)
        } else {
          // The cache signal read was already ended for a short-lived deferral
          // (or there is no cacheSignal), so serve a plain stream.
          stream = streamA
        }
      } else {
        // Entry was discarded (e.g. due to recently revalidated tags)
        debug?.('Resume Data Cache entry discarded', serializedCacheKey)

        if (cacheSignal) {
          cacheSignal.endRead()
        }
      }
    } else {
      debug?.('Resume Data Cache entry not found', serializedCacheKey)

      if (cacheSignal) {
        cacheSignal.endRead()
      }

      switch (workUnitStore.type) {
        case 'prerender':
          if (resumeDataCache?.mutable === false) {
            // We're prerendering a fallback shell whose Resume Data Cache is
            // the prefilled, read-only seed from a phase-1 prerender of a more-
            // specific sibling route. A miss here means the cache key depends
            // on a fallback param. We short-circuit to a dynamic hole (which
            // may produce an empty shell if there's no parent Suspense
            // boundary). Currently this also catches layouts and pages that
            // don't read params, which will be improved when we implement
            // NAR-136. Compared to the instrumentation-based params bailout we
            // also do here, this covers the case where params are transformed
            // with an async function before being passed into the "use cache"
            // function, which escapes the instrumentation.
            return makeHangingPromise(
              workUnitStore.renderSignal,
              workStore.route,
              'dynamic "use cache"'
            )
          }
        // fallthrough
        case 'prerender-runtime':
          if (!cacheSignal) {
            // This is the final prerender (cacheSignal is null), which means
            // all caches should have been warmed during the prospective
            // prerender. A cache miss here indicates that the cache key is
            // non-deterministic (e.g. due to unstable array order in the
            // arguments). Known dynamic keys (e.g. from fallback params) are
            // already handled by the early return above. We return a hanging
            // promise so this becomes a dynamic hole rather than generating a
            // broken cache entry that gets aborted.
            console.warn(
              new Error(
                `Unexpected cache miss after cache warming phase during prerendering. This is likely caused by non-deterministic arguments that differ between the cache warming phase and the final prerender phase (e.g. unstable array order). Ensure that arguments passed to cached functions are deterministic.`
              )
            )
            return makeHangingPromise(
              workUnitStore.renderSignal,
              workStore.route,
              'dynamic "use cache"'
            )
          }
          break
        case 'prerender-legacy':
        case 'request':
        case 'cache':
        case 'private-cache':
        case 'unstable-cache':
        case 'generate-static-params':
          break
        default:
          workUnitStore satisfies never
      }
    }
  }

  // Intra-request deduplication: Within a single request, root params are
  // fixed, so the coarse key (serializedCacheKey) is sufficient. If another
  // invocation in this request is already handling the same cache entry
  // (including the cache handler lookup and generation), we join it instead of
  // doing redundant work. This also saves cache handler `get` calls which may
  // be HTTP round-trips for remote handlers.
  if (stream === undefined) {
    const intraRequestPendingCacheInvocation =
      workStore.pendingCacheInvocations?.get(serializedCacheKey)

    if (intraRequestPendingCacheInvocation) {
      const cacheSignal = getCacheSignal(workUnitStore)
      cacheSignal?.beginRead()

      debug?.('joining pending intra-request invocation', serializedCacheKey)
      const sharedCacheResult = await intraRequestPendingCacheInvocation

      if (sharedCacheResult.type === 'prerender-dynamic') {
        debug?.('joined invocation is prerender-dynamic', serializedCacheKey)
        cacheSignal?.endRead()
        return sharedCacheResult.hangingPromise
      }

      debug?.(
        'joined invocation resolved with cached entry',
        serializedCacheKey
      )

      stream = sharedCacheResult.entry.fork()

      // If the leader was nested inside another cache (no accessible RDC), it
      // couldn't save to the RDC. This joiner may be top-level with an RDC, in
      // which case it must save here; otherwise the RDC lookup during the
      // final prerender will miss.
      saveSharedCacheEntryToResumeDataCache(
        serializedCacheKey,
        sharedCacheResult.entry,
        resumeDataCache
      )

      // End the cache signal read when the result is fully collected, not when
      // the stream is available. Fire-and-forget propagation runs in the same
      // .then() callback. .catch() prevents unhandled rejection if collection
      // fails after the rendering stream was already resolved.
      sharedCacheResult.entry.pendingMetadata
        .then((metadata) => {
          cacheSignal?.endRead()
          maybePropagateCacheEntryMetadata(cacheContext, metadata)
        })
        .catch(() => {})
    }
  }

  // Leader path: no pending intra-request invocation found. Check for a
  // cross-request pending invocation, or become the leader for both.
  if (stream === undefined) {
    const resolvableSharedCacheResult = new ResolvableSharedCacheResult()

    debug?.(
      'registering as intra-request invocation leader',
      serializedCacheKey
    )
    const intraRequestPendingCacheInvocations =
      (workStore.pendingCacheInvocations ??= new Map<
        string,
        Promise<SharedCacheResult>
      >())
    resolvableSharedCacheResult.registerIn(
      intraRequestPendingCacheInvocations,
      serializedCacheKey
    )

    // Cross-request deduplication lets concurrent requests for the same key
    // share a single fill. Private caches are skipped in production, where they
    // hold request-specific data that must not be shared across requests. In
    // development they're persisted and keyed by the request's cookies and
    // headers, so concurrent requests with identical request data should share
    // a fill too; that request-scoped `cacheHandlerKey` keeps requests with
    // different cookies or headers in separate entries.
    const skipCrossRequestDedupe = isPrivate && !process.env.__NEXT_DEV_SERVER

    try {
      // The loop handles cross-request root param mismatches: when a
      // cross-request joiner discovers that the leader's root params differ
      // from its own, it retries with a recomputed cacheHandlerKey. The loop
      // exits when stream is assigned (cross-request joiner match or leader
      // path) or via early return (prerender-dynamic).
      while (stream === undefined) {
        const crossRequestPendingCacheInvocation = skipCrossRequestDedupe
          ? undefined
          : crossRequestPendingCacheInvocations.get(cacheHandlerKey)

        if (crossRequestPendingCacheInvocation) {
          const cacheSignal = getCacheSignal(workUnitStore)
          cacheSignal?.beginRead()

          debug?.('joining pending cross-request invocation', cacheHandlerKey)
          const sharedCacheResult = await crossRequestPendingCacheInvocation

          if (sharedCacheResult.type === 'cached') {
            // Root param verification: wait for metadata, then check key. MUST
            // happen before fork() — if key mismatches, we retry without having
            // used the stream.
            const metadata = await sharedCacheResult.entry.pendingMetadata

            // Ensure known root param names are up-to-date before verifying the
            // key, since the leader's save path may not have updated them yet
            // at this point.
            if (metadata.readRootParamNames) {
              addKnownRootParamNames(id, metadata.readRootParamNames)
            }

            const updatedRootParamNames = knownRootParamsByFunctionId.get(id)
            if (updatedRootParamNames && rootParams) {
              const newCacheHandlerKey =
                cacheHandlerKeyBase +
                computeRootParamsCacheKeySuffix(
                  rootParams,
                  updatedRootParamNames
                )

              if (newCacheHandlerKey !== cacheHandlerKey) {
                debug?.(
                  'cross-request root param mismatch, retrying',
                  cacheHandlerKey,
                  '→',
                  newCacheHandlerKey
                )
                cacheSignal?.endRead()
                cacheHandlerKey = newCacheHandlerKey
                continue // stream is not used → retry with new key
              }
            }

            // Key matches — safe to fork.
            debug?.(
              'cross-request invocation matched, forking result',
              cacheHandlerKey
            )
            cacheSignal?.endRead()
            stream = sharedCacheResult.entry.fork()
            maybePropagateCacheEntryMetadata(cacheContext, metadata)

            // The cross-request leader belongs to a different request with its
            // own RDC. Save to this request's RDC so its final prerender can
            // resume from the entry.
            saveSharedCacheEntryToResumeDataCache(
              serializedCacheKey,
              sharedCacheResult.entry,
              resumeDataCache
            )

            // Resolve for intra-request joiners in this request. They get
            // a fork from the same SharedCacheEntry.
            resolvableSharedCacheResult.resolve(sharedCacheResult)
            break
          } else {
            // prerender-dynamic — same root param check before hanging
            const updatedRootParamNames = knownRootParamsByFunctionId.get(id)
            if (updatedRootParamNames && rootParams) {
              const newCacheHandlerKey =
                cacheHandlerKeyBase +
                computeRootParamsCacheKeySuffix(
                  rootParams,
                  updatedRootParamNames
                )

              if (newCacheHandlerKey !== cacheHandlerKey) {
                debug?.(
                  'cross-request root param mismatch, retrying',
                  cacheHandlerKey,
                  '→',
                  newCacheHandlerKey
                )
                cacheSignal?.endRead()
                cacheHandlerKey = newCacheHandlerKey
                continue
              }
            }

            debug?.(
              'cross-request invocation is prerender-dynamic',
              cacheHandlerKey
            )
            if (resumeDataCache?.mutable) {
              resumeDataCache.dynamicCacheKeys.add(serializedCacheKey)
            }
            cacheSignal?.endRead()
            resolvableSharedCacheResult.resolve(sharedCacheResult)
            return sharedCacheResult.hangingPromise
          }
        }

        // No pending cross-request invocation — become the leader.
        if (!skipCrossRequestDedupe) {
          debug?.(
            'registering as cross-request invocation leader',
            cacheHandlerKey
          )
          resolvableSharedCacheResult.registerIn(
            crossRequestPendingCacheInvocations,
            cacheHandlerKey
          )
        }

        const cacheSignal = getCacheSignal(workUnitStore)
        if (cacheSignal) {
          // Either the cache handler or the generation can be using I/O at this
          // point. We need to track when they start and when they complete.
          cacheSignal.beginRead()
        }

        const lazyRefreshTags = workStore.refreshTagsByCacheKind.get(kind)

        if (lazyRefreshTags && !isResolvedLazyResult(lazyRefreshTags)) {
          await lazyRefreshTags
        }

        let entry: CacheEntry | undefined

        // We ignore existing cache entries when force revalidating.
        if (cacheHandler && !shouldForceRevalidate(workStore, workUnitStore)) {
          entry = await cacheHandler.get(cacheHandlerKey, implicitTags)

          // Check if this is a redirect entry (coarse key → specific key).
          // Redirect entries have private tags encoding the root param names
          // (one tag per param name, prefixed with _N_RP_).
          if (entry && rootParams) {
            const paramNames = new Set<string>()
            for (const tag of entry.tags) {
              if (tag.startsWith(NEXT_CACHE_ROOT_PARAM_TAG_ID)) {
                paramNames.add(tag.slice(NEXT_CACHE_ROOT_PARAM_TAG_ID.length))
              }
            }
            if (paramNames.size > 0) {
              addKnownRootParamNames(id, paramNames)
              cacheHandlerKey =
                cacheHandlerKeyBase +
                computeRootParamsCacheKeySuffix(rootParams, paramNames)
              entry = await cacheHandler.get(cacheHandlerKey, implicitTags)
            }
          }
        }

        if (entry) {
          let implicitTagsExpiration = 0

          if (workUnitStore.implicitTags) {
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
            debug?.('discarding expired entry', cacheHandlerKey)
            entry = undefined
          }
        }

        const currentTime = performance.timeOrigin + performance.now()
        if (
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
              if (entry.revalidate === 0) {
                debug?.(
                  'omitting entry',
                  cacheHandlerKey,
                  'from static shell due to revalidate: 0'
                )
              } else {
                debug?.(
                  'omitting entry',
                  cacheHandlerKey,
                  'from static shell due to short expire value:',
                  entry.expire
                )
              }
              if (cacheSignal) {
                cacheSignal.endRead()
              }

              const hangingPromise = makeHangingPromise<never>(
                workUnitStore.renderSignal,
                workStore.route,
                'dynamic "use cache"'
              )
              debug?.('leader resolved as prerender-dynamic', cacheHandlerKey)
              resolvableSharedCacheResult.resolve({
                type: 'prerender-dynamic',
                hangingPromise,
              })
              return hangingPromise
            case 'request': {
              if (process.env.NODE_ENV === 'development') {
                // A short-lived entry is a dynamic hole, excluded from the
                // static shell, so we end the cache signal read here (the
                // prerender case does the same) to avoid this cache hit being
                // considered a cache miss when checking for pending cache reads
                // at staged rendering task boundaries. The value is deferred to
                // the runtime stage.
                if (cacheSignal && !cacheSignalReadEnded) {
                  cacheSignal.endRead()
                  cacheSignalReadEnded = true
                }

                const stagedRendering = workUnitStore.stagedRendering
                const stage = stagedRendering
                  ? getSessionDataStage(stagedRendering)
                  : RenderStage.Runtime
                await makeDevtoolsIOAwarePromise(
                  undefined,
                  workUnitStore,
                  stage
                )
              }
              break
            }
            case 'prerender-runtime':
            case 'prerender-legacy':
            case 'cache':
            case 'private-cache':
            case 'unstable-cache':
            case 'generate-static-params':
              break
            default:
              workUnitStore satisfies never
          }
        }

        if (entry !== undefined && entry.stale < DYNAMIC_STALE) {
          switch (workUnitStore.type) {
            case 'request': {
              // A short stale time excludes the entry from prerenders.
              // We delay it here to match that.
              if (process.env.NODE_ENV === 'development') {
                // End the cache signal read (once, in case the expire block
                // above already did) so the deferred value isn't counted as a
                // pending read at a staged rendering boundary, then defer it to
                // the dynamic stage.
                if (cacheSignal && !cacheSignalReadEnded) {
                  cacheSignal.endRead()
                  cacheSignalReadEnded = true
                }
                await makeDevtoolsIOAwarePromise(
                  undefined,
                  workUnitStore,
                  RenderStage.Dynamic
                )
              }
              break
            }
            case 'prerender':
            case 'prerender-runtime':
            case 'prerender-legacy':
            case 'cache':
            case 'private-cache':
            case 'unstable-cache':
            case 'generate-static-params':
              // A handler read in a prerender context is a cache-filling read.
              // The stale exclusion for those is applied when the RDC is read
              // in the final prerender, so there's nothing to do here.
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

          // If the cache entry is stale and we're prerendering, we don't want
          // to use the stale entry since it would unnecessarily need to shorten
          // the lifetime of the prerender. We're not time constrained here so
          // we can re-generated it now.

          // We need to run this inside a clean AsyncLocalStorage snapshot so
          // that the cache generation cannot read anything from the context
          // we're currently executing which might include request specific
          // things like cookies() inside a React.cache().
          // Note: It is important that we await at least once before this
          // because it lets us pop out of any stack specific contexts as well -
          // aka "Sync" Local Storage.

          if (entry) {
            if (currentTime > entry.timestamp + entry.expire * 1000) {
              debug?.('entry is expired', cacheHandlerKey)
            }

            if (
              workStore.isStaticGeneration &&
              currentTime > entry.timestamp + entry.revalidate * 1000
            ) {
              debug?.('static generation, entry is stale', cacheHandlerKey)
            }
          }

          if (cacheSignal && cacheSignalReadEnded) {
            // A short-lived deferral above (a `revalidate` of zero or a short
            // expire, or a short stale time) already ended this read. We're now
            // regenerating the entry rather than serving it, and the generation
            // ends the read again once its entry is collected. Re-begin the
            // read here so the trailing `endRead` stays balanced instead of
            // over-decrementing the cache signal.
            cacheSignal.beginRead()
            cacheSignalReadEnded = false
          }

          const result = await generateCacheEntry(
            workStore,
            cacheContext,
            clientReferenceManifest,
            encodedCacheKeyParts,
            fn,
            timeoutError,
            deadlockError
          )

          if (result.type === 'prerender-dynamic') {
            debug?.(
              'leader resolved as prerender-dynamic (generation)',
              cacheHandlerKey
            )
            if (resumeDataCache?.mutable) {
              resumeDataCache.dynamicCacheKeys.add(serializedCacheKey)
            }
            resolvableSharedCacheResult.resolve(result)
            return result.hangingPromise
          }

          const { stream: newStream, pendingCacheResult } = result

          // Cross-request joiners derive their metadata from this promise. By
          // default it's the collected result, but when we write to a cache
          // handler we swap in a promise that resolves only after the write has
          // landed, so a joiner that re-reads its recomputed key finds the
          // entry.
          let metadataSource: Promise<CollectedCacheResult> = pendingCacheResult

          // When draft mode is enabled, we must not save the cache entry.
          if (!workStore.isDraftMode) {
            const savedCacheResult = saveToResumeDataCache(
              resumeDataCache,
              serializedCacheKey,
              pendingCacheResult
            )

            if (cacheHandler) {
              metadataSource = saveToCacheHandler(
                cacheHandler,
                workStore,
                id,
                cacheHandlerKeyBase,
                savedCacheResult,
                rootParams
              )
            }
          }

          debug?.('leader resolved with generated entry', cacheHandlerKey)

          const pendingMetadata: Promise<CacheResultMetadata> =
            metadataSource.then((collected) => ({
              tags: collected.entry.tags,
              revalidate: collected.entry.revalidate,
              expire: collected.entry.expire,
              stale: collected.entry.stale,
              timestamp: collected.entry.timestamp,
              hasExplicitRevalidate: collected.hasExplicitRevalidate,
              hasExplicitExpire: collected.hasExplicitExpire,
              readRootParamNames: collected.readRootParamNames,
              dynamicNestedCacheError: collected.dynamicNestedCacheError,
            }))

          const sharedCacheEntry = new SharedCacheEntry(
            newStream,
            pendingMetadata
          )
          stream = sharedCacheEntry.fork()
          resolvableSharedCacheResult.resolve({
            type: 'cached',
            entry: sharedCacheEntry,
          })
        } else {
          const entryMetadata: CacheResultMetadata = {
            tags: entry.tags,
            revalidate: entry.revalidate,
            expire: entry.expire,
            stale: entry.stale,
            timestamp: entry.timestamp,
            readRootParamNames: knownRootParamsByFunctionId.get(id),
            // For pre-existing entries from cache handlers we don't know
            // whether they had explicit cache life values or not. But we only
            // need this information during prerendering when we produce new
            // entries, where the cache life of an inner cache may be propagated
            // to the outer one. In that case we use the RDC. So it's safe to
            // set this to undefined here.
            hasExplicitRevalidate: undefined,
            hasExplicitExpire: undefined,
            // The same applies to the dynamic nested cache error.
            dynamicNestedCacheError: undefined,
          }

          maybePropagateCacheEntryMetadata(cacheContext, entryMetadata)

          // We want to return this stream, even if it's stale.
          stream = entry.value

          // If we have a mutable resume data cache, we need to clone the entry
          // and add it to the resume data cache.
          if (resumeDataCache?.mutable) {
            const [entryLeft, entryRight] = cloneCacheEntry(entry)
            if (cacheSignal && !cacheSignalReadEnded) {
              stream = createTrackedReadableStream(entryLeft.value, cacheSignal)
            } else {
              // The read was already ended for a short-lived deferral (or there
              // is no cacheSignal), so serve a plain stream.
              stream = entryLeft.value
            }

            // The RDC is per-page and root params are fixed within a page, so
            // we always use the coarse key (without root param suffix).
            resumeDataCache.cache.set(
              serializedCacheKey,
              Promise.resolve({
                entry: entryRight,
                hasExplicitRevalidate: entryMetadata.hasExplicitRevalidate,
                hasExplicitExpire: entryMetadata.hasExplicitExpire,
                readRootParamNames: entryMetadata.readRootParamNames,
                dynamicNestedCacheError: entryMetadata.dynamicNestedCacheError,
              })
            )
          } else if (!cacheSignalReadEnded) {
            // If we're not regenerating we need to signal that we've finished
            // putting the entry into the cache scope at this point. Otherwise
            // we do that inside generateCacheEntry. (Skipped when the read was
            // already ended for a short-lived deferral.)
            cacheSignal?.endRead()
          }

          debug?.('leader resolved with cache handler hit', cacheHandlerKey)

          const sharedCacheEntry = new SharedCacheEntry(
            stream,
            Promise.resolve(entryMetadata)
          )
          stream = sharedCacheEntry.fork()
          resolvableSharedCacheResult.resolve({
            type: 'cached',
            entry: sharedCacheEntry,
          })

          // Trigger a background revalidation when the entry is stale (past its
          // `revalidate`), so the next read gets a fresh value without blocking
          // this one. In development with the in-memory cache disabled
          // (`cacheMaxMemorySize: 0`), built-in entries keep their resolved
          // (potentially non-dynamic) cache life, so an entry read back from
          // the dev in-memory cache is normally still fresh and wouldn't
          // revalidate on its own; revalidate those on every dynamic request
          // render too, so each reload still shows a fresh value.
          let shouldTriggerBackgroundRevalidation =
            currentTime > entry.timestamp + entry.revalidate * 1000
          if (
            !shouldTriggerBackgroundRevalidation &&
            process.env.__NEXT_DEV_SERVER &&
            isMemoryCacheDisabled() &&
            !isCustomCacheHandler(kind)
          ) {
            switch (workUnitStore.type) {
              case 'request':
                shouldTriggerBackgroundRevalidation = true
                break
              case 'cache':
              case 'private-cache':
              case 'prerender':
              case 'prerender-runtime':
              case 'prerender-legacy':
              case 'unstable-cache':
              case 'generate-static-params':
                break
              default:
                workUnitStore satisfies never
            }
          }

          if (shouldTriggerBackgroundRevalidation) {
            const revalidateCacheHandlerKey = cacheHandlerKey
            const revalidatePromise = generateCacheEntry(
              workStore,
              // The background revalidation preserves the outer store for
              // reading (e.g. implicitTags) but skips propagation of cache life
              // and tags back to the outer scope.
              {
                ...cacheContext,
                skipPropagation: true,
              },
              clientReferenceManifest,
              encodedCacheKeyParts,
              fn,
              timeoutError,
              deadlockError
            )
              .then(async (result) => {
                if (result.type === 'cached') {
                  const { stream: ignoredStream, pendingCacheResult } = result

                  const savedCacheResult = saveToResumeDataCache(
                    resumeDataCache,
                    serializedCacheKey,
                    pendingCacheResult
                  )

                  if (cacheHandler) {
                    saveToCacheHandler(
                      cacheHandler,
                      workStore,
                      id,
                      cacheHandlerKeyBase,
                      savedCacheResult,
                      rootParams
                    )
                  }

                  await ignoredStream.cancel()
                }
              })
              .catch((error) => {
                debug?.(
                  'background cache revalidation failed for',
                  revalidateCacheHandlerKey,
                  error
                )
              })
            workStore.pendingRevalidateWrites ??= []
            workStore.pendingRevalidateWrites.push(revalidatePromise)
          }
        }
      }
    } catch (error) {
      resolvableSharedCacheResult.reject(error)
      throw error
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
  workUnitStore: WorkUnitStore
): boolean {
  if (workStore.isOnDemandRevalidate || workStore.isDraftMode) {
    return true
  }

  if (process.env.__NEXT_DEV_SERVER) {
    switch (workUnitStore.type) {
      case 'request':
        return workUnitStore.headers.get('cache-control') === 'no-cache'
      case 'cache':
      case 'private-cache':
        return workUnitStore.forceRevalidate
      case 'prerender-runtime':
      case 'prerender':
      case 'prerender-client':
      case 'validation-client':
      case 'prerender-legacy':
      case 'unstable-cache':
      case 'generate-static-params':
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
  workUnitStore: WorkUnitStore,
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
  switch (workUnitStore.type) {
    case 'prerender':
      return false
    case 'prerender-runtime':
    case 'prerender-client':
    case 'validation-client':
    case 'prerender-legacy':
    case 'request':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'generate-static-params':
      break
    default:
      workUnitStore satisfies never
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
