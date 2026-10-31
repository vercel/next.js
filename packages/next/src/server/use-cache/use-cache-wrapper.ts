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

import type { WorkStore } from '../app-render/work-async-storage.external'
import { workAsyncStorage } from '../app-render/work-async-storage.external'
import type {
  PrerenderStoreModernClient,
  PrerenderStoreModernRuntime,
  PrerenderStoreModernServer,
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
  getVaryParamsAccumulator,
  workUnitAsyncStorage,
  getDraftModeProviderForCacheScope,
  getCacheSignal,
  isHmrRefresh,
  getServerComponentsHmrCache,
  willConsumerServerCache,
} from '../app-render/work-unit-async-storage.external'
import { accumulateVaryParam } from '../app-render/vary-params'

import {
  applyOwnerStack,
  makeDevtoolsIOAwarePromise,
  makeDynamicHangingPromise,
  makeFallbackParamsHangingPromise,
  makeUntrackedHangingPromise,
  makeSessionDataHangingPromise,
  makeURLDataHangingPromise,
  makePrefetchHangingPromise,
  makeUnknownRuntimeDataHangingPromise,
  RENDER_STAGES_BY_DATA_KIND,
  trackFallbackParamsAccessed,
  trackURLDataAccessed,
  trackIncompatibleShellContent,
  trackPromiseUsed,
} from '../dynamic-rendering-utils'

import type { ClientReferenceManifest } from '../../build/webpack/plugins/flight-manifest-plugin'

import {
  getClientReferenceManifest,
  getRscModuleMappingForUseCache,
  getServerActionsManifest,
  getServerModuleMap,
  normalizeWorkerPageName,
} from '../app-render/manifests-singleton'
import type { CacheEntry } from '../lib/cache-handlers/types'
import type { CacheSignal } from '../app-render/cache-signal'
import { decryptActionBoundArgs } from '../app-render/encryption'
import { InvariantError } from '../../shared/lib/invariant-error'
import {
  createReactServerErrorHandler,
  type DigestedError,
} from '../app-render/create-error-handler'
import stringHash from 'next/dist/compiled/string-hash'
import {
  MIN_PRERENDERABLE_EXPIRE,
  MIN_PREFETCHABLE_STALE,
  MIN_SHELL_STALE,
} from './constants'
import { NEXT_CACHE_ROOT_PARAM_TAG_ID } from '../../lib/constants'
import {
  getCacheHandler,
  getDevTieredCacheHandler,
  getPrivateCacheHandler,
  isBuiltInCacheHandler,
  isCustomCacheHandler,
  isMemoryCacheDisabled,
} from './handlers'
import type { CacheReadWriteHandler } from './tiered-cache-handler'
import { cloneCacheEntry } from './clone-cache-entry'
import { NEXT_INSTANT_TEST_COOKIE } from '../../client/components/app-router-headers'
import {
  RequestCookiesAdapter,
  type ReadonlyRequestCookies,
} from '../web/spec-extension/adapters/request-cookies'
import {
  HeadersAdapter,
  type ReadonlyHeaders,
} from '../web/spec-extension/adapters/headers'
import {
  NestedDynamicUseCacheError,
  UnexpectedCacheMissError,
  UseCacheDeadlockError,
  UseCacheTimeoutError,
} from './use-cache-errors'
import {
  createNestedCacheShortExpireError,
  createNestedCacheZeroRevalidateError,
  createUseCachePrivateInsidePublicUseCacheError,
  createUseCachePrivateInsideUnstableCacheError,
  createUseCachePrivateOutsideRequestContextError,
} from './use-cache-messages'
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
import {
  FALLBACK_PARAMS,
  RUNTIME_DATA,
  SESSION_DATA,
} from '../resume-data-cache/cache-store'
import { createLazyResult, isResolvedLazyResult } from '../lib/lazy-result'
import {
  abortOnDynamicAccess,
  dynamicAccessAsyncStorage,
  type DynamicAccessAsyncStore,
} from '../app-render/dynamic-access-async-storage.external'
import type { CacheLife } from './cache-life'
import {
  RenderStage,
  type AdvanceableRenderStage,
} from '../app-render/staged-rendering'
import * as Log from '../../build/output/log'
import { getServerReact, getClientReact } from '../runtime-reacts.external'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'

export async function cache(
  handlerKind: string,
  functionId: string,
  boundArgumentsLength: number,
  originalFunction: (...functionArguments: unknown[]) => Promise<unknown>,
  functionArguments: unknown[]
): Promise<unknown> {
  const cacheContext = initializeCacheContext(handlerKind, functionId)
  if (cacheContext.type === 'prerender-dynamic') {
    return cacheContext.hangingPromise
  }

  const pendingCacheRenderStage = waitForCacheRenderStage(cacheContext)
  if (pendingCacheRenderStage !== undefined) {
    await pendingCacheRenderStage
  }

  const encodedCacheInvocation = await encodeCacheInvocation(
    cacheContext,
    originalFunction,
    functionArguments,
    boundArgumentsLength
  )
  if (encodedCacheInvocation.type === 'prerender-dynamic') {
    return encodedCacheInvocation.hangingPromise
  }

  if (
    process.env.__NEXT_DEV_SERVER &&
    cacheContext.workStore.useCacheProbeMode
  ) {
    return runCacheProbe(
      cacheContext,
      encodedCacheInvocation,
      cacheContext.workStore.useCacheProbeMode.timeoutMs
    )
  }

  const cacheInvocationKeys = await createCacheInvocationKeys(
    cacheContext,
    encodedCacheInvocation
  )
  const resumeDataCache = getResumeDataCache(cacheContext.outerWorkUnitStore)
  const resumeDataCacheRead =
    resumeDataCache === null
      ? undefined
      : await readFromResumeDataCache(
          resumeDataCache,
          cacheContext,
          cacheInvocationKeys
        )
  const cacheResult =
    resumeDataCacheRead?.result ??
    (await readOrFillCache(
      cacheContext,
      encodedCacheInvocation,
      cacheInvocationKeys,
      resumeDataCache,
      resumeDataCacheRead?.value
    ))
  if (cacheResult.type === 'prerender-dynamic') {
    return cacheResult.hangingPromise
  }

  return decodeCacheStream(
    cacheResult.stream,
    encodedCacheInvocation.temporaryReferences
  )
}

interface PrivateCacheContext extends CacheContextBase {
  readonly kind: 'private'
  readonly outerWorkUnitStore:
    | RequestStore
    | PrivateUseCacheStore
    | PrerenderStoreModernRuntime
}

interface PublicCacheContext extends CacheContextBase {
  readonly kind: 'public'
  // TODO: We should probably forbid nesting "use cache" inside unstable_cache.
  readonly outerWorkUnitStore: Exclude<
    WorkUnitStore,
    PrerenderStoreModernClient | ValidationStoreClient
  >
  /**
   * Supplies the cause when this entry's dynamic cache life makes the enclosing
   * public cache report a nested-cache error.
   */
  readonly dynamicNestedCacheError: Error | undefined
}

type CacheContext = PrivateCacheContext | PublicCacheContext

interface CacheContextBase {
  readonly outerOwnerStack: string | undefined
  /**
   * The `'use cache'` function's server reference id (second arg of
   * `cache()`).
   */
  readonly functionId: string
  /**
   * The cache handler kind (first arg of `cache()`, e.g. 'default').
   */
  readonly handlerKind: string
  readonly type: 'ready'
  readonly workStore: WorkStore
  readonly cacheHandler: CacheReadWriteHandler | undefined
  readonly clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
  readonly hangingInputAbortSignal: AbortSignal | undefined
  readonly timeoutError: UseCacheTimeoutError
  readonly deadlockError: UseCacheDeadlockError | undefined
  readonly logPrefix: string
}

interface EncodedCacheInvocation {
  readonly type: 'encoded'
  readonly functionToCache: (
    ...functionArguments: unknown[]
  ) => Promise<unknown>
  readonly encodedCacheKeyParts: FormData | string
  readonly temporaryReferences: ReturnType<
    typeof createClientTemporaryReferenceSet
  >
  readonly runtimeEnvVarStateHash: string | undefined
}

interface CacheStreamResult {
  readonly type: 'stream'
  readonly stream: ReadableStream<Uint8Array>
}

interface CacheDynamicResult {
  readonly type: 'prerender-dynamic'
  readonly hangingPromise: Promise<never>
}

type CacheResult = CacheStreamResult | CacheDynamicResult

const nextVersion = process.env.__NEXT_VERSION as string

export type CacheKeyParts = [
  functionId: string,
  functionArguments: unknown[],
  implementationHash: unknown,
]

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
 * Retains a stream branch so multiple invocations can read the generated cache
 * entry. Metadata collection and cache handler writes have separate promises
 * because rendering can use the entry before its cache handler writes finish.
 */
class SharedCacheEntry {
  private stream: ReadableStream<Uint8Array>
  private readonly pendingCollectedCacheResult: Promise<CollectedCacheResult>

  /**
   * Resolves when collection finishes, without waiting for handler writes.
   */
  public readonly pendingMetadata: Promise<CacheResultMetadata>

  /**
   * Resolves with collected metadata after any handler writes settle. Write
   * failures do not discard the metadata. Collection failures still reject this
   * promise.
   */
  public readonly pendingCompletion: Promise<CacheResultMetadata>

  constructor(
    stream: ReadableStream<Uint8Array>,
    pendingCollectedCacheResult: Promise<CollectedCacheResult>,
    pendingCacheHandlerWrite: Promise<void> | undefined
  ) {
    this.stream = stream
    this.pendingCollectedCacheResult = pendingCollectedCacheResult

    this.pendingMetadata = pendingCollectedCacheResult.then(
      (collectedCacheResult): CacheResultMetadata => ({
        tags: collectedCacheResult.entry.tags,
        revalidate: collectedCacheResult.entry.revalidate,
        expire: collectedCacheResult.entry.expire,
        stale: collectedCacheResult.entry.stale,
        timestamp: collectedCacheResult.entry.timestamp,
        hasExplicitRevalidate: collectedCacheResult.hasExplicitRevalidate,
        hasExplicitExpire: collectedCacheResult.hasExplicitExpire,
        readRootParamNames: collectedCacheResult.readRootParamNames,
        dynamicNestedCacheError: collectedCacheResult.dynamicNestedCacheError,
      })
    )

    this.pendingCompletion =
      pendingCacheHandlerWrite === undefined
        ? this.pendingMetadata
        : pendingCacheHandlerWrite.then(
            () => this.pendingMetadata,
            () => this.pendingMetadata
          )
  }

  /**
   * Returns a stream branch for one consumer and retains the other branch for
   * subsequent consumers.
   */
  fork(): ReadableStream<Uint8Array> {
    const [forked, remaining] = this.stream.tee()
    this.stream = remaining
    return forked
  }

  /**
   * Returns a collected branch for the Resume Data Cache. The collected stream
   * errors when rendering failed, so serialization can omit failed entries.
   */
  forkCollectedResult(): Promise<CollectedCacheResult> {
    return this.pendingCollectedCacheResult.then(cloneCollectedCacheResult)
  }
}

interface SharedCacheEntryResult {
  readonly type: 'cached'
  readonly entry: SharedCacheEntry
}

interface SharedCacheDynamicResult {
  readonly type: 'prerender-dynamic'
  readonly reason: typeof FALLBACK_PARAMS | typeof RUNTIME_DATA
  readonly hangingPromise: Promise<never>
}

type SharedCacheResult = SharedCacheEntryResult | SharedCacheDynamicResult

interface CacheLookupRetry {
  readonly type: 'retry-lookup'
}

type CacheInvocationResult = SharedCacheResult | CacheLookupRetry

type CacheGenerationCompletion = 'cached' | 'prerender-dynamic'

/**
 * Runs the cached function, collects its result, and writes the cache entry.
 * Cross-request generation deduplication can share it until collection and
 * cache handler writes settle.
 */
interface CacheGeneration {
  readonly cacheInvocationKeys: CacheInvocationKeys
  // The stream can be read before collection and cache handler writes finish.
  readonly result: Promise<SharedCacheResult>
  // Keeps generation registered through all writes and reports their failures.
  readonly completion: Promise<CacheGenerationCompletion>
}

/**
 * Coordinates generation for intra-request deduplication. It starts or joins a
 * CacheGeneration after a cache handler lookup requires generation. A joined
 * generation can require another lookup if its read root params change the
 * cache handler key for this invocation's root param values.
 */
interface PendingCacheInvocation {
  readonly type: 'pending'
  // A cache handler key mismatch requires another lookup before serving data.
  readonly result: Promise<CacheInvocationResult>
  // Settles after cache handler writes and the intra-request state update.
  readonly completion: Promise<void>
}

interface CompletedCacheInvocation {
  readonly type: 'completed'
  readonly completion: Promise<void>
  readonly result: SharedCacheEntryResult
  readonly metadata: CacheResultMetadata
}

type CacheInvocation = PendingCacheInvocation | CompletedCacheInvocation

/**
 * Intra-request deduplication shares cache handler lookups and generation
 * within one WorkStore. This includes a Server Action and its subsequent
 * render. Prerender phases can also share a WorkStore. Separate validation
 * renders use separate WorkStores.
 *
 * Cross-request generation deduplication shares pending generation across
 * WorkStores. Each WorkStore performs independent cache handler lookups because
 * requests can observe different invalidations.
 */
export interface CacheDeduplicationState {
  cacheInvocationKeys: CacheInvocationKeys
  cacheHandlerLookup: CacheHandlerLookup | undefined
  cacheInvocation: CacheInvocation | undefined
}

interface CacheInvocationKeys {
  readonly cacheHandlerKey: string
  readonly cacheHandlerKeyBase: string
  readonly serializedCacheKey: string
}

/**
 * Provides intra-request deduplication of cache handler reads. It follows a
 * redirect for read root params and can retry a cache miss after concurrent
 * generation completes its cache handler writes.
 */
interface CacheHandlerLookup {
  readonly cacheInvocationKeys: CacheInvocationKeys
  readonly result: Promise<CacheHandlerLookupResult>
}

interface CacheHandlerLookupResult {
  readonly cacheHandlerKey: string
  readonly entry: CacheEntry | undefined
  // Record the generation pending before get() for each key. These references
  // permit a lookup retry or avoid duplicate background revalidation after
  // generation completes. They do not retain generated cache entries.
  readonly initialKeyGenerationCompletion:
    | Promise<CacheGenerationCompletion>
    | undefined
  readonly redirectedKeyGenerationCompletion:
    | Promise<CacheGenerationCompletion>
    | undefined
}

type ResumeDataCacheValue = ReturnType<ResumeDataCache['cache']['get']>

interface ResumeDataCacheRead {
  readonly value: ResumeDataCacheValue
  readonly result: CacheResult | undefined
}

const pendingCacheGenerations = new Map<string, CacheGeneration>()

// The first argument at each call site is the full directive that produced the
// invocation, e.g. "'use cache'" or "'use cache: remote'".
const debug = process.env.NEXT_PRIVATE_DEBUG_CACHE
  ? console.debug.bind(console)
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

// Tracks which root params each cache function has historically read. Used to
// compute the specific cache key upfront on subsequent invocations. In-memory
// only — after server restart, the coarse-key redirect entry in the cache
// handler provides fallback.
const knownRootParamsByFunctionId = new Map<string, Set<string>>()

// Next-internal cookies that must not vary the private cache key, since they're
// not part of the application's own cookie state. The instant-navigation cookie
// toggles while a navigation lock is held, so including it would force spurious
// misses.
const COOKIES_EXCLUDED_FROM_PRIVATE_CACHE_KEY = new Set<string>([
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
   * The root param names that were read during cache entry generation. Used to
   * compute the specific cache key after generation completes. `undefined` for
   * pre-existing entries from cache handlers where we don't have this
   * information.
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

interface GeneratedCacheEntry {
  readonly type: 'cached'
  readonly stream: ReadableStream<Uint8Array>
  readonly pendingCacheResult: Promise<CollectedCacheResult>
}

type GenerateCacheEntryResult = GeneratedCacheEntry | SharedCacheDynamicResult

function initializeCacheContext(
  handlerKind: string,
  functionId: string
): CacheContext | CacheDynamicResult {
  const isPrivate = handlerKind === 'private'

  // The default handler kind corresponds to the bare 'use cache' directive.
  const logPrefix =
    handlerKind === 'default' ? `'use cache'` : `'use cache: ${handlerKind}'`

  const workStore = workAsyncStorage.getStore()
  if (workStore === undefined) {
    throw new Error(
      '"use cache" cannot be used outside of App Router. Expected a WorkStore.'
    )
  }

  const workUnitStore = workUnitAsyncStorage.getStore()
  if (workUnitStore === undefined) {
    throw new InvariantError(
      '"use cache" cannot be used outside of App Router. Expected a WorkUnitStore.'
    )
  }

  // In a prerender, tasky IO may result in cache reads that start after the
  // prerender has already been aborted:
  //
  // await setTimeout(100) // we can't abort this uncached IO... await
  // cachedData() // ...so we'll still get here even though the prerender
  // aborted
  //
  // The prerender is over, so we should just return an erroring promise. (NOTE:
  // we also shouldn't fill this cache, because it's behind uncached IO, so
  // semantically it is not part of the prerender)
  switch (workUnitStore.type) {
    case 'prerender':
    case 'prerender-runtime': {
      if (workUnitStore.renderSignal.aborted) {
        // We don't know if the cache itself is dynamic or runtime data, but the
        // prerender is over, so it doesn't need to participate in runtime data
        // tracking at all.
        return {
          type: 'prerender-dynamic',
          hangingPromise: makeUntrackedHangingPromise<never>(
            workUnitStore.renderSignal,
            workStore.route,
            '"use cache" called after prerender ended'
          ),
        }
      }
      break
    }
    case 'prerender-legacy':
    case 'prerender-client':
    case 'validation-client':
    case 'request':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'build-time-generator':
      break
    default:
      workUnitStore satisfies never
  }

  // Probe re-executions (the dev-server's hang-detection worker) short-circuit
  // further down before any handler is consulted, so we skip handler selection
  // entirely and the worker can boot without registering handlers at all.
  let cacheHandler: CacheReadWriteHandler | undefined
  if (workStore.useCacheProbeMode === undefined) {
    if (isPrivate) {
      // Private caches normally go to the Resume Data Cache (RDC), not a cache
      // handler. In development we additionally persist them in a dedicated
      // built-in in-memory handler so that reloads are fast.
      if (process.env.__NEXT_DEV_SERVER) {
        cacheHandler = getPrivateCacheHandler()
      }
    } else {
      const handler = getCacheHandler(handlerKind)
      if (!handler) {
        throw new Error('Unknown cache handler: ' + handlerKind)
      }

      // In development, a user-configured (custom) handler may be slow or
      // remote, so we read through a tiered handler that puts a built-in
      // in-memory front in front of it to keep cache hits microtask-fast.
      // Built-in handlers (the default handler, and its size-0 replacement) are
      // already in-memory and used directly.
      if (process.env.__NEXT_DEV_SERVER && isCustomCacheHandler(handlerKind)) {
        // A custom kind always has a dev tiered handler: it is created in the
        // same `setCacheHandler` call that makes `isCustomCacheHandler` true.
        const tieredCacheHandler = getDevTieredCacheHandler(handlerKind)
        if (!tieredCacheHandler) {
          throw new InvariantError(
            `Expected a dev tiered cache handler for kind "${handlerKind}".`
          )
        }

        cacheHandler = tieredCacheHandler
      } else {
        cacheHandler = handler
      }
    }
  }

  const timeoutError = new UseCacheTimeoutError(workStore.route)
  Error.captureStackTrace(timeoutError, cache)
  applyOwnerStack(timeoutError)

  // Capture the caller before any await removes its synchronous frames.
  let deadlockError: UseCacheDeadlockError | undefined
  if (process.env.__NEXT_DEV_SERVER) {
    deadlockError = new UseCacheDeadlockError(workStore.route)
    Error.captureStackTrace(deadlockError, cache)
    applyOwnerStack(deadlockError)
  }

  const outerOwnerStack =
    process.env.NODE_ENV !== 'production'
      ? captureOuterOwnerStack(workUnitStore)
      : undefined

  const cacheContextBase: CacheContextBase = {
    type: 'ready',
    outerOwnerStack,
    functionId,
    handlerKind,
    workStore,
    cacheHandler,
    clientReferenceManifest: getClientReferenceManifest(),
    hangingInputAbortSignal: createHangingInputAbortSignal(workUnitStore),
    timeoutError,
    deadlockError,
    logPrefix,
  }

  let cacheContext: CacheContext
  if (isPrivate) {
    const expression = '"use cache: private"'

    switch (workUnitStore.type) {
      // "use cache: private" is dynamic in prerendering contexts.
      case 'prerender':
        // Private caches can read request data. At this point we don't know
        // Whether it's going to use session data or URL data. TODO(app-shells):
        // This could be narrowed (and thus optimized) if we checked whether URL
        // data is included in the cache key, because it can only be passed in
        // as arguments.
        return {
          type: 'prerender-dynamic',
          hangingPromise: makeUnknownRuntimeDataHangingPromise(
            workUnitStore.renderSignal,
            workStore.route,
            expression,
            workUnitStore
          ),
        }
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
        throw recordInvalidDynamicUsageError(
          workStore,
          createUseCachePrivateInsideUnstableCacheError(workStore.route)
        )
      }
      case 'cache': {
        throw recordInvalidDynamicUsageError(
          workStore,
          createUseCachePrivateInsidePublicUseCacheError(workStore.route)
        )
      }
      case 'request':
      case 'prerender-runtime':
      case 'private-cache':
        cacheContext = {
          ...cacheContextBase,
          kind: 'private',
          outerWorkUnitStore: workUnitStore,
        }
        break
      case 'build-time-generator':
        throw recordInvalidDynamicUsageError(
          workStore,
          createUseCachePrivateOutsideRequestContextError(
            workStore.route,
            workUnitStore.functionName
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
        // in `cache()`. Used as `cause` of the nested-dynamic cache error when
        // the outer cache (whose body never re-runs during the final prerender)
        // throws. Only constructed when the parent is itself a public `'use
        // cache'` — otherwise this entry can never propagate dynamism into that
        // error and the allocation would be wasted. Private parents are
        // intentionally excluded: `'use cache: private'` is
        // dynamic-by-definition in prerendering and deferred to the runtime
        // stage in dev requests, so a public cache nested inside one never
        // triggers the throw upstream.
        const dynamicNestedCacheError = new NestedDynamicUseCacheError()
        Error.captureStackTrace(dynamicNestedCacheError, cache)
        applyOwnerStack(dynamicNestedCacheError)

        cacheContext = {
          ...cacheContextBase,
          kind: 'public',
          outerWorkUnitStore: workUnitStore,
          dynamicNestedCacheError,
        }
        break
      }
      case 'prerender':
      case 'prerender-runtime':
      case 'prerender-legacy':
      case 'request':
      case 'private-cache':
      case 'unstable-cache':
      // TODO: We should probably forbid nesting "use cache" inside
      // unstable_cache. (fallthrough)
      case 'build-time-generator':
        cacheContext = {
          ...cacheContextBase,
          kind: 'public',
          outerWorkUnitStore: workUnitStore,
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

  return cacheContext
}

function recordInvalidDynamicUsageError(
  workStore: WorkStore,
  error: Error
): Error {
  Error.captureStackTrace(error, cache)
  workStore.invalidDynamicUsageError ??= error
  return error
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
    case 'build-time-generator':
      break
    default:
      workUnitStore satisfies never
  }

  return capturedOwnerStack + (parentOuterOwnerStack || '') || undefined
}

function waitForCacheRenderStage(
  cacheContext: CacheContext
): Promise<void> | undefined {
  if (cacheContext.kind === 'private') {
    const { outerWorkUnitStore } = cacheContext
    switch (outerWorkUnitStore.type) {
      case 'prerender-runtime': {
        // In a runtime prerender, we have to make sure that APIs that would
        // hang during a static prerender are resolved with a delay, in the
        // appropriate runtime stage.
        const stagedRendering = outerWorkUnitStore.stagedRendering
        if (stagedRendering) {
          return stagedRendering.waitForStage(
            RENDER_STAGES_BY_DATA_KIND.sessionData
          )
        }
        break
      }
      case 'request': {
        if (isValidationRender(outerWorkUnitStore)) {
          // Similar to runtime prerenders, private caches should not resolve in
          // the static stage of a validation request, so we delay them.
          return makeDevtoolsIOAwarePromise(
            undefined,
            outerWorkUnitStore,
            RENDER_STAGES_BY_DATA_KIND.sessionData
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

  return undefined
}

/**
 * Returns `true` if the `'use cache'` function is the page component itself, or
 * `generateMetadata`/`generateViewport` in a page file.
 */
function isPageSegmentFunction(
  functionArguments: any[]
): functionArguments is [UseCachePageProps, ...unknown[]] {
  const [maybeProps] = functionArguments

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
  functionArguments: any[]
): functionArguments is [UseCacheLayoutProps, ...unknown[]] {
  const [maybeProps] = functionArguments

  return (
    maybeProps !== null &&
    typeof maybeProps === 'object' &&
    (maybeProps as UseCacheLayoutProps).$$isLayout === true
  )
}

async function encodeCacheInvocation(
  cacheContext: CacheContext,
  originalFunction: (...functionArguments: unknown[]) => Promise<unknown>,
  functionArguments: unknown[],
  boundArgumentsLength: number
): Promise<EncodedCacheInvocation | CacheDynamicResult> {
  const { workStore, hangingInputAbortSignal } = cacheContext
  const workUnitStore = cacheContext.outerWorkUnitStore
  const functionId = cacheContext.functionId

  const functionName = originalFunction.name
  let functionToCache = originalFunction
  let isPageOrLayoutSegmentFunction = false

  // For page and layout segment functions (i.e. the page/layout component, or
  // generateMetadata/generateViewport), the cache function is overwritten,
  // which allows us to apply special handling for params and searchParams. For
  // pages and layouts we're using the outer params prop, and not the inner one
  // that was serialized/deserialized. While it's not generally true for "use
  // cache" args, in the case of `params` the inner and outer object are
  // essentially equivalent, so this is safe to do (including fallback params
  // that are hanging promises). It allows us to avoid waiting for the timeout,
  // when prerendering a fallback shell of a cached page or layout that awaits
  // params.
  if (isPageSegmentFunction(functionArguments)) {
    isPageOrLayoutSegmentFunction = true

    const [
      { params: outerParams, searchParams: outerSearchParams },
      ...otherOuterArguments
    ] = functionArguments

    const props: UseCachePageInnerProps = {
      params: outerParams,
      // Omit searchParams and $$isPage.
    }

    if (cacheContext.kind === 'private') {
      // Private caches allow accessing search params. We need to include them
      // in the serialized args and when generating the cache key.
      props.searchParams = outerSearchParams
    }

    functionArguments = [props, ...otherOuterArguments]

    functionToCache = {
      [functionName]: async (
        _: UseCachePageInnerProps,
        ...otherInnerArguments: unknown[]
      ) =>
        originalFunction.apply(null, [
          {
            params: props.params,
            searchParams:
              // Preserve the original search params, if this cache can access
              // them. Notably, in a runtime shell private caches can resolve,
              // but search params will be hanging, and we need to preserve the
              // original proxied promise object to trigger
              // `dynamicAccessAbortSignal` when they're accessed.
              props.searchParams ??
              // For public caches, search params are omitted from the cache key
              // (and the serialized args) to avoid mismatches between
              // prerendering and resuming a cached page that does not access
              // search params. This is also the reason why we're not using a
              // hanging promise for search params. For cached pages that do
              // access them, which is an invalid dynamic usage, we need to
              // ensure that an error is shown.
              makeErroringSearchParamsForUseCache(),
          },
          ...otherInnerArguments,
        ]),
    }[functionName] as (...functionArguments: unknown[]) => Promise<unknown>
  } else if (isLayoutSegmentFunction(functionArguments)) {
    isPageOrLayoutSegmentFunction = true

    const [
      { params: outerParams, $$isLayout, ...outerSlots },
      ...otherOuterArguments
    ] = functionArguments

    // Overwrite the props to omit $$isLayout. Note that slots are only passed
    // to the layout component (if any are defined), and not to generateMetadata
    // nor generateViewport. For those functions, outerSlots/innerSlots is an
    // empty object, which is fine because we're just spreading it into the
    // props.
    functionArguments = [
      { params: outerParams, ...outerSlots },
      ...otherOuterArguments,
    ]

    functionToCache = {
      [functionName]: async (
        {
          params: _innerParams,
          ...innerSlots
        }: Omit<UseCacheLayoutProps, '$$isLayout'>,
        ...otherInnerArguments: unknown[]
      ) =>
        originalFunction.apply(null, [
          { params: outerParams, ...innerSlots },
          ...otherInnerArguments,
        ]),
    }[functionName] as (...functionArguments: unknown[]) => Promise<unknown>
  }

  if (boundArgumentsLength > 0) {
    if (functionArguments.length === 0) {
      throw new InvariantError(
        `Expected the "use cache" function ${JSON.stringify(functionToCache.name)} to receive its encrypted bound arguments as the first argument.`
      )
    }

    const encryptedBoundArguments = functionArguments.shift() as Promise<string>
    const boundArguments = await decryptActionBoundArgs(
      functionId,
      encryptedBoundArguments
    )
    if (!Array.isArray(boundArguments)) {
      throw new InvariantError(
        `Expected the bound arguments of "use cache" function ${JSON.stringify(functionToCache.name)} to deserialize into an array, got ${typeof boundArguments} instead.`
      )
    }

    if (boundArgumentsLength !== boundArguments.length) {
      throw new InvariantError(
        `Expected the "use cache" function ${JSON.stringify(functionToCache.name)} to receive ${boundArgumentsLength} bound arguments, got ${boundArguments.length} instead.`
      )
    }

    functionArguments.unshift(boundArguments)
  }

  const temporaryReferences = createClientTemporaryReferenceSet()

  // The base serialized cache key doesn't include runtime env var state or the
  // cookies and headers that private caches are allowed to read. Env var state
  // only scopes the cache handler because the RDC must reuse entries across
  // rendering phases. In production private cache entries aren't stored in a
  // cache handler, only in the Resume Data Cache (RDC): private caches are only
  // used during dynamic requests and runtime prefetches; for dynamic requests
  // the RDC is immutable and excludes private caches, and for runtime
  // prefetches it's mutable but lives only as long as the request. In
  // development private caches are persisted across requests, so
  // `cacheHandlerKeyBase` (below) additionally scopes the handler key by the
  // request's cookies and headers.
  const { implementationPart, runtimeEnvVarStateHash } =
    await computeCacheKeyImplementationPart(
      workStore,
      workUnitStore,
      functionId
    )
  const cacheKeyParts: CacheKeyParts = [
    functionId,
    functionArguments,
    implementationPart,
  ]
  const encodeCacheKeyParts = () =>
    encodeReply(cacheKeyParts, {
      temporaryReferences,
      signal: hangingInputAbortSignal,
    })

  let encodedCacheKeyParts: FormData | string
  switch (workUnitStore.type) {
    case 'prerender-runtime':
    // A runtime prerender may be a runtime shell, which does not have access to
    // params/searchParams, so we want to apply the same dynamic access logic as
    // we do in static prerenders. fallthrough
    case 'prerender':
      if (!isPageOrLayoutSegmentFunction) {
        // If the "use cache" function is not a page or layout segment function,
        // we need to track dynamic access already when encoding the arguments.
        // If params are passed explicitly into a "use cache" function (as
        // opposed to receiving them automatically in a page or layout), we
        // assume that the params are also accessed. This allows us to abort
        // early, and treat the function as dynamic, instead of waiting for the
        // timeout to be reached.
        const dynamicAccessStore: DynamicAccessAsyncStore = {
          abortController: new AbortController(),
          reason: null,
        }

        encodedCacheKeyParts = await dynamicAccessAsyncStorage.run(
          dynamicAccessStore,
          encodeCacheKeyParts
        )

        if (dynamicAccessStore.abortController.signal.aborted) {
          const makeHangingPromise =
            dynamicAccessStore.reason === 'fallback-params'
              ? makeFallbackParamsHangingPromise
              : makeURLDataHangingPromise
          return {
            type: 'prerender-dynamic',
            hangingPromise: makeHangingPromise(
              workUnitStore.renderSignal,
              workStore.route,
              'dynamic "use cache"',
              workUnitStore
            ),
          }
        }
        break
      }
    // fallthrough
    case 'prerender-legacy':
    case 'request':
    // TODO(restart-on-cache-miss): We need to handle params/searchParams on
    // page components. the promises will be tasky, so `encodeCacheKeyParts`
    // will not resolve in the static stage. We have not started a cache read at
    // this point, so we might just miss the cache completely. fallthrough
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'build-time-generator':
    case undefined:
      encodedCacheKeyParts = await encodeCacheKeyParts()
      break
    default:
      return workUnitStore satisfies never
  }

  return {
    type: 'encoded',
    functionToCache,
    encodedCacheKeyParts,
    temporaryReferences,
    runtimeEnvVarStateHash,
  }
}

/**
 * This returns cache key parts that cover everything that can affect the result
 * of the cached function (apart from the arguments). The implementation part is
 * used by both the RDC and cache handler, while the runtime env var state hash
 * is only used by the cache handler. The RDC is per-page and must reuse entries
 * across rendering phases even if an env var changes between them.
 *
 * The parts cover:
 * - codeHash: the code itself that generates the return value
 *    - Notably, this excludes the following modules.  Those are included via
 *      the Next.js version anyway:
 *    - react, react-dom, private-next-rsc-server-reference,
 *      private-next-rsc-cache-wrapper
 * - runtimeEnvVarsRead: the keys and values of runtime environment variables
 *   that the code reads
 * - runtimeEnvVarExistence: the unset/falsy/truthy state of runtime environment
 *   variables used in boolean contexts
 * - the version of Next.js (to account for RSC wire format changes, or
 *   use-cache-wrapper.ts changes)
 *
 * In case that granular information isn't available, fall back to
 * buildId/deploymentId/hmrRefreshHash, which is a correct hash but
 * over-invalidates way too often.
 */
async function computeCacheKeyImplementationPart(
  workStore: WorkStore,
  workUnitStore: WorkUnitStore,
  functionId: string
): Promise<{
  implementationPart: unknown
  runtimeEnvVarStateHash: string | undefined
}> {
  let durability = workStore.durableUseCacheEntries
    ? getServerActionsManifest().node[functionId].workers?.[
        normalizeWorkerPageName(workStore.page)
      ]?.durability
    : undefined
  if (durability) {
    // use cache is only supported in Node.js runtime. So we can use the Node.js
    // crypto module here.
    const crypto = require('crypto') as typeof import('crypto')
    let runtimeEnvVarStateHash = crypto
      // Hash the env var values, to not leak secrets into the cache key.
      .createHash('sha256')
      .update(
        [
          ...durability.runtimeEnvVarsRead.map((k) => {
            // Make sure not to stringify `undefined` and `"undefined"` to the
            // same value.
            return process.env[k] != null ? `${k}==${process.env[k]}` : k
          }),
          ...durability.runtimeEnvVarsExistence.map((k) => {
            const value = process.env[k]
            const state = value == null ? 'unset' : value ? 'truthy' : 'falsy'
            return `${k}~=${state}`
          }),
        ].join('\0') ?? ''
      )
      .digest('hex')

    // The env var state is added to the cache handler key separately so it
    // doesn't affect RDC lookups between rendering phases.
    return {
      implementationPart: [durability.codeHash, nextVersion],
      runtimeEnvVarStateHash,
    }
  } else {
    // Because the Action ID is not yet unique per implementation of that Action
    // we can't safely reuse the results across builds yet. In the meantime we
    // add the buildId to the arguments as a seed to ensure they're not reused.
    // Remove this once Action IDs hash the implementation.
    const buildId = workStore.deploymentId || workStore.buildId

    // In dev mode, when the HMR refresh hash is set, we include it in the cache
    // key. This ensures that cache entries are not reused when server
    // components have been edited. This is a very coarse approach. But it's
    // also only a temporary solution until Action IDs are unique per
    // implementation. Remove this once Action IDs hash the implementation.
    const hmrRefreshHash = getHmrRefreshHash(workUnitStore)

    // otherwise fall back to buildId and/or the HMR hash.
    return {
      implementationPart: hmrRefreshHash
        ? [buildId, hmrRefreshHash]
        : [buildId],
      runtimeEnvVarStateHash: undefined,
    }
  }
}

async function runCacheProbe(
  cacheContext: CacheContext,
  encodedCacheInvocation: EncodedCacheInvocation,
  probeTimeoutMs: number
): Promise<void> {
  const { workStore, clientReferenceManifest, timeoutError } = cacheContext
  const { encodedCacheKeyParts, functionToCache } = encodedCacheInvocation

  // Both public and private caches probe via the same path. The worker
  // reconstructs real `headers` / `cookies` / `draftMode` from the forwarded
  // request snapshot, so private caches that legitimately read those work in
  // the probe just like in the real fill. The deadlock error never gets thrown
  // from inside the worker: the worker's outer store has `cacheSignal:
  // undefined`, so `generateCacheEntryImpl` skips the dev-request branch and
  // the idle probe is never set up.
  const generatedCacheEntryResult = await generateCacheEntry(
    workStore,
    cacheContext,
    clientReferenceManifest,
    encodedCacheKeyParts,
    functionToCache,
    timeoutError,
    undefined
  )
  if (generatedCacheEntryResult.type === 'prerender-dynamic') {
    // Unreachable in the probe: outer store is `'request'`-typed, which never
    // produces this variant.
    throw new InvariantError(
      'Unexpected `prerender-dynamic` result in `use cache` probe mode.'
    )
  }

  // We don't consume the returned stream — `pendingCacheResult` is what
  // completes when `collectResult` has drained `savedStream`. Cancel the unused
  // copy so it doesn't buffer forever.
  generatedCacheEntryResult.stream.cancel().catch(() => {})

  let probeTimeoutTimer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([
      generatedCacheEntryResult.pendingCacheResult,
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
}

async function createCacheInvocationKeys(
  cacheContext: CacheContext,
  encodedCacheInvocation: EncodedCacheInvocation
): Promise<CacheInvocationKeys> {
  const workUnitStore = cacheContext.outerWorkUnitStore
  const functionId = cacheContext.functionId
  const { encodedCacheKeyParts, runtimeEnvVarStateHash } =
    encodedCacheInvocation

  const serializedCacheKey =
    typeof encodedCacheKeyParts === 'string'
      ? // Fast path for the simple case for simple inputs. We let the CacheHandler
        // Convert it to an ArrayBuffer if it wants to.
        encodedCacheKeyParts
      : await encodeFormData(encodedCacheKeyParts)

  const rootParams = workUnitStore.rootParams
  const knownRootParamNames = knownRootParamsByFunctionId.get(functionId)

  // The coarse cache-handler key. With no root params read, it locates the
  // entry directly; otherwise it locates a redirect entry from which the
  // specific key (this key + root params, computed below) is derived. It's
  // scoped by runtime env var state and, for private caches in development
  // (persisted in the built-in in-memory handler), the request's cookies and
  // headers. Keys derived from it inherit that scoping.
  const cacheHandlerKeyBase =
    serializedCacheKey +
    (runtimeEnvVarStateHash ?? '') +
    (process.env.__NEXT_DEV_SERVER && cacheContext.kind === 'private'
      ? computePrivateCacheKeyRequestSuffix(
          cacheContext.outerWorkUnitStore.cookies,
          cacheContext.outerWorkUnitStore.headers
        )
      : '')

  // If we already know which root params this function reads, include them in
  // the cache handler key for a direct hit (skipping the redirect entry).
  // rootParams is undefined when nested inside unstable_cache.
  const cacheHandlerKey =
    knownRootParamNames && rootParams
      ? cacheHandlerKeyBase +
        computeRootParamsCacheKeySuffix(rootParams, knownRootParamNames)
      : cacheHandlerKeyBase

  return {
    cacheHandlerKey,
    cacheHandlerKeyBase,
    serializedCacheKey,
  }
}

async function encodeFormData(formData: FormData): Promise<string> {
  let result = ''
  for (let [key, value] of formData) {
    // We don't need this key to be serializable but from a security perspective
    // it should not be possible to generate a string that looks the same from a
    // different structure. To ensure this we need a delimeter between fields
    // but just using a delimeter is not enough since a string might contain
    // that delimeter. We use the length of each field as the delimeter to avoid
    // escaping the values.
    result += key.length.toString(16) + ':' + key

    let stringValue
    if (typeof value === 'string') {
      stringValue = value
    } else {
      // The FormData might contain binary data that is not valid UTF-8 so this
      // cache key may generate a UCS-2 string. Passing this to another service
      // needs to be aware that the key might not be compatible.
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

function addKnownRootParamNames(
  functionId: string,
  names: ReadonlySet<string>
): Set<string> {
  const existing = knownRootParamsByFunctionId.get(functionId)
  if (existing) {
    for (const name of names) {
      existing.add(name)
    }
    return existing
  }

  const created = new Set(names)
  knownRootParamsByFunctionId.set(functionId, created)
  return created
}

function decodeCacheStream(
  stream: ReadableStream<Uint8Array>,
  temporaryReferences: ReturnType<typeof createClientTemporaryReferenceSet>
): Promise<unknown> {
  // Logs are replayed even if it's a hit - to ensure we see them on the client
  // eventually. If we didn't then the client wouldn't see the logs if it was
  // seeded from a prewarm that never made it to the client. However, this also
  // means that you see logs even when the cached function isn't actually
  // re-executed. We should instead ensure prewarms always make it to the
  // client. Another issue is that this will cause double logging in the server
  // terminal. Once while generating the cache entry and once when replaying it
  // on the server, which is required to pick it up for replaying again on the
  // client.
  const replayConsoleLogs = true

  const serverConsumerManifest = {
    // moduleLoading must be null because we don't want to trigger preloads of
    // ClientReferences to be added to the consumer. Instead, we'll wait for any
    // ClientReference to be emitted which themselves will handle the
    // preloading.
    moduleLoading: null,
    moduleMap: getRscModuleMappingForUseCache(),
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

async function readFromResumeDataCache(
  resumeDataCache: ResumeDataCache,
  cacheContext: CacheContext,
  cacheInvocationKeys: CacheInvocationKeys
): Promise<ResumeDataCacheRead> {
  const value = resumeDataCache.cache.get(
    cacheInvocationKeys.serializedCacheKey
  )
  const { workStore, outerWorkUnitStore: workUnitStore } = cacheContext
  let result: CacheResult | undefined
  switch (value) {
    case FALLBACK_PARAMS:
    case RUNTIME_DATA:
    case SESSION_DATA: {
      switch (workUnitStore.type) {
        case 'prerender':
        case 'prerender-runtime': {
          const makeHangingPromise =
            value === FALLBACK_PARAMS
              ? makeFallbackParamsHangingPromise
              : value === SESSION_DATA
                ? makeSessionDataHangingPromise
                : makeURLDataHangingPromise
          result = {
            type: 'prerender-dynamic',
            hangingPromise: makeHangingPromise(
              workUnitStore.renderSignal,
              workStore.route,
              'dynamic "use cache"',
              workUnitStore
            ),
          }
          break
        }
        case 'prerender-legacy':
        case 'request':
        case 'cache':
        case 'private-cache':
        case 'unstable-cache':
        case 'build-time-generator':
          result = handleMissingResumeDataCacheEntry(
            resumeDataCache,
            cacheContext,
            cacheInvocationKeys
          )
          break
        default:
          workUnitStore satisfies never
      }
      break
    }
    case undefined:
      result = handleMissingResumeDataCacheEntry(
        resumeDataCache,
        cacheContext,
        cacheInvocationKeys
      )
      break
    default: {
      const collectedCacheResult = await readResumeDataCacheEntry(
        cacheContext,
        cacheInvocationKeys,
        value
      )
      result =
        collectedCacheResult === undefined
          ? undefined
          : await consumeResumeDataCacheEntry(
              cacheContext,
              cacheInvocationKeys,
              collectedCacheResult
            )
    }
  }
  // A later write can replace the selected value, but must preserve an entry
  // another invocation saved after this read.
  return { value, result }
}

function handleMissingResumeDataCacheEntry(
  resumeDataCache: ResumeDataCache,
  cacheContext: CacheContext,
  cacheInvocationKeys: CacheInvocationKeys
): CacheDynamicResult | undefined {
  const { workStore, logPrefix } = cacheContext
  const { serializedCacheKey } = cacheInvocationKeys
  const workUnitStore = cacheContext.outerWorkUnitStore

  const cacheSignal = getCacheSignal(workUnitStore)
  debug?.(
    logPrefix,
    'Resume Data Cache entry not found',
    serializedCacheKey,
    `(${resumeDataCache.cache.size} entries)`
  )
  switch (workUnitStore.type) {
    case 'prerender':
      if (resumeDataCache.mutable === false) {
        // We're prerendering a fallback shell whose Resume Data Cache is the
        // prefilled, read-only seed from a phase-1 prerender of a more-
        // specific sibling route. A miss here means the cache key depends on a
        // fallback param. We short-circuit to a dynamic hole (which may produce
        // an empty shell if there's no parent Suspense boundary). Currently
        // this also catches layouts and pages that don't read params, which
        // will be improved when we implement NAR-136. Compared to the
        // instrumentation-based params bailout we also do here, this covers the
        // case where params are transformed with an async function before being
        // passed into the "use cache" function, which escapes the
        // instrumentation. The cache key depends on fallback params, which are
        // URL data.
        return {
          type: 'prerender-dynamic',
          hangingPromise: makeURLDataHangingPromise(
            workUnitStore.renderSignal,
            workStore.route,
            'dynamic "use cache"',
            workUnitStore
          ),
        }
      }
    // fallthrough
    case 'prerender-runtime':
      if (!cacheSignal) {
        // This is the final prerender (cacheSignal is null), which means all
        // caches should have been warmed during the prospective prerender. A
        // cache miss here indicates that the cache key is non-deterministic
        // (e.g. due to unstable array order in the arguments). Known dynamic
        // keys (e.g. from fallback params) are already handled by the early
        // return above. We return a hanging promise so this becomes a dynamic
        // hole rather than generating a broken cache entry that gets aborted.
        console.warn(new UnexpectedCacheMissError(workStore.route))
        // This is an anomaly (non-deterministic cache key), so we can't know
        // whether a runtime prerender would resolve it.
        return {
          type: 'prerender-dynamic',
          hangingPromise: makeUnknownRuntimeDataHangingPromise(
            workUnitStore.renderSignal,
            workStore.route,
            'dynamic "use cache"',
            workUnitStore
          ),
        }
      }
      break
    case 'prerender-legacy':
    case 'request':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'build-time-generator':
      break
    default:
      workUnitStore satisfies never
  }

  return undefined
}

async function readResumeDataCacheEntry(
  cacheContext: CacheContext,
  cacheInvocationKeys: CacheInvocationKeys,
  pendingCollectedCacheResult: Promise<CollectedCacheResult>
): Promise<CollectedCacheResult | undefined> {
  const { workStore, logPrefix } = cacheContext
  const implicitTags = cacheContext.outerWorkUnitStore.implicitTags?.tags ?? []
  const { serializedCacheKey } = cacheInvocationKeys

  const cacheSignal = getCacheSignal(cacheContext.outerWorkUnitStore)
  cacheSignal?.beginRead()
  try {
    let collectedCacheResult: CollectedCacheResult | undefined =
      await pendingCollectedCacheResult

    // Check if the RDC entry should be discarded due to recently revalidated
    // tags. When a server action calls updateTag(), the re-render should see
    // fresh data instead of stale RDC data.
    if (collectedCacheResult !== undefined) {
      const { timestamp } = collectedCacheResult.entry
      if (
        collectedCacheResult.entry.tags.some((tag) =>
          isRevalidatedAfter(tag, timestamp, workStore, logPrefix)
        ) ||
        implicitTags.some((tag) =>
          isRevalidatedAfter(tag, timestamp, workStore, logPrefix)
        )
      ) {
        debug?.(
          logPrefix,
          'discarding RDC entry due to recently revalidated tags',
          serializedCacheKey
        )
        collectedCacheResult = undefined
      }
    }

    if (collectedCacheResult === undefined) {
      debug?.(
        logPrefix,
        'Resume Data Cache entry discarded',
        serializedCacheKey
      )
    }

    return collectedCacheResult
  } finally {
    cacheSignal?.endRead()
  }
}

async function consumeResumeDataCacheEntry(
  cacheContext: CacheContext,
  cacheInvocationKeys: CacheInvocationKeys,
  collectedCacheResult: CollectedCacheResult
): Promise<CacheResult> {
  const { workStore, logPrefix } = cacheContext
  const { serializedCacheKey } = cacheInvocationKeys
  const workUnitStore = cacheContext.outerWorkUnitStore
  const cacheSignal = getCacheSignal(workUnitStore)
  cacheSignal?.beginRead()
  let cacheSignalReadActive = true
  try {
    if (
      collectedCacheResult.entry.revalidate === 0 ||
      collectedCacheResult.entry.expire < MIN_PRERENDERABLE_EXPIRE
    ) {
      // The nested-cache error only makes sense when a dynamic nested cache
      // actually shortened an outer cache that has no explicit `cacheLife`
      // (`dynamicNestedCacheError` is set), and only when the app's default
      // profile is itself prerenderable. If the default profile is already
      // dynamic (`revalidate: 0` or an `expire` under the prerenderable
      // minimum), every cache is omitted from prerenders by default, so there
      // is no silent degradation to warn about. A short life from the default
      // profile, or from a dev private cache's self-imposed `revalidate: 0`
      // (which never carries a nested error), therefore stays a dynamic hole
      // rather than erroring.
      const defaultCacheLife = workStore.cacheLifeProfiles.default
      const shouldReportNestedCacheError =
        collectedCacheResult.dynamicNestedCacheError !== undefined &&
        defaultCacheLife.revalidate !== 0 &&
        defaultCacheLife.expire >= MIN_PRERENDERABLE_EXPIRE

      switch (workUnitStore.type) {
        case 'prerender':
          // In a Dynamic I/O prerender, if the cache entry has revalidate: 0 or
          // if the expire time is under 5 minutes, then we consider this cache
          // entry dynamic as it's not worth generating static pages for such
          // data. It's better to leave a dynamic hole that can be filled in
          // during the resume with a potentially cached entry.
          if (collectedCacheResult.entry.revalidate === 0) {
            if (
              collectedCacheResult.hasExplicitRevalidate === false &&
              shouldReportNestedCacheError
            ) {
              throw recordInvalidDynamicUsageError(
                workStore,
                createNestedCacheZeroRevalidateError(
                  workStore.route,
                  collectedCacheResult.dynamicNestedCacheError
                )
              )
            }

            debug?.(
              logPrefix,
              'omitting entry',
              serializedCacheKey,
              'from static shell due to revalidate: 0'
            )
          } else {
            if (
              collectedCacheResult.hasExplicitExpire === false &&
              shouldReportNestedCacheError
            ) {
              throw recordInvalidDynamicUsageError(
                workStore,
                createNestedCacheShortExpireError(
                  workStore.route,
                  collectedCacheResult.dynamicNestedCacheError
                )
              )
            }

            debug?.(
              logPrefix,
              'omitting entry',
              serializedCacheKey,
              'from static shell due to short expire value:',
              collectedCacheResult.entry.expire
            )
          }

          // Static prerenders omit this entry. Runtime prerenders can serve it.
          //
          // TODO(app-shells): Does this handle the MIN_SHELL_STALE case below
          // correctly?
          return {
            type: 'prerender-dynamic',
            hangingPromise: makeSessionDataHangingPromise(
              workUnitStore.renderSignal,
              workStore.route,
              'dynamic "use cache"',
              workUnitStore
            ),
          }
        case 'prerender-runtime': {
          // In the final phase of a runtime prerender, we have to make sure
          // that APIs that would hang during a static prerender are resolved
          // with a delay, in the appropriate runtime stage.
          const stagedRendering = workUnitStore.stagedRendering
          if (stagedRendering) {
            await stagedRendering.waitForStage(
              RENDER_STAGES_BY_DATA_KIND.sessionData
            )
          }
          break
        }
        case 'request': {
          if (isValidationRender(workUnitStore)) {
            // These throws force an explicit cache life decision on an outer
            // cache that a nested cache would otherwise silently shorten (see
            // `shouldReportNestedCacheError` above). Otherwise the short-lived
            // entry is deferred as a dynamic hole below.
            if (
              collectedCacheResult.entry.revalidate === 0 &&
              collectedCacheResult.hasExplicitRevalidate === false &&
              shouldReportNestedCacheError
            ) {
              throw recordInvalidDynamicUsageError(
                workStore,
                createNestedCacheZeroRevalidateError(
                  workStore.route,
                  collectedCacheResult.dynamicNestedCacheError
                )
              )
            }

            if (
              collectedCacheResult.entry.expire < MIN_PRERENDERABLE_EXPIRE &&
              collectedCacheResult.hasExplicitExpire === false &&
              shouldReportNestedCacheError
            ) {
              throw recordInvalidDynamicUsageError(
                workStore,
                createNestedCacheShortExpireError(
                  workStore.route,
                  collectedCacheResult.dynamicNestedCacheError
                )
              )
            }

            if (cacheSignalReadActive) {
              cacheSignal?.endRead()
              cacheSignalReadActive = false
            }
            await makeDevtoolsIOAwarePromise(
              undefined,
              workUnitStore,
              RENDER_STAGES_BY_DATA_KIND.sessionData
            )
          }
          break
        }
        case 'prerender-legacy':
        case 'cache':
        case 'private-cache':
        case 'unstable-cache':
        case 'build-time-generator':
          break
        default:
          workUnitStore satisfies never
      }
    }

    if (collectedCacheResult.entry.stale < MIN_SHELL_STALE) {
      // The entry's stale time is short enough that it's excluded from shells.
      // If it's below `MIN_PREFETCHABLE_STALE`, it's not worth prefetching at
      // all and is excluded from prerenders entirely, leaving a dynamic hole
      // that can be filled during the navigation. Otherwise, it's still
      // included in prerenders and cached navigations, but it must not be part
      // of an App Shell, which may be reused on the client for longer than the
      // entry's stale time. We delay the entry to resolve in the post-shell
      // (link data) stage, which excludes both its content and its stale time
      // from the shell.
      const isPrefetchable =
        collectedCacheResult.entry.stale >= MIN_PREFETCHABLE_STALE
      switch (workUnitStore.type) {
        case 'prerender':
        case 'prerender-runtime': {
          const prerenderStore = workUnitStore
          if (!isPrefetchable) {
            debug?.(
              logPrefix,
              'omitting entry',
              serializedCacheKey,
              'from shell due to short stale value:',
              collectedCacheResult.entry.stale
            )

            // An unprefetchable entry (stale < MIN_PREFETCHABLE_STALE) is
            // excluded from all prerenders.
            return {
              type: 'prerender-dynamic',
              hangingPromise: makeDynamicHangingPromise(
                prerenderStore.renderSignal,
                workStore.route,
                'dynamic "use cache"'
              ),
            }
          } else {
            // This entry is prefetchable, but exluded from shells.
            const stagedRendering = prerenderStore.stagedRendering
            if (stagedRendering === null) {
              // Prospective prerender (no staging): do not delay, because if we
              // didn't have this entry in the RDC already, we wouldn't delay it
              // either.
            } else {
              // Final prerender (with staging). This entry cannot be part of
              // the shell, so we delay it to the prefetch.
              let prefetchStage: AdvanceableRenderStage
              if (prerenderStore.type === 'prerender') {
                prefetchStage = RENDER_STAGES_BY_DATA_KIND.staticUrlData.static
              } else {
                prefetchStage = RENDER_STAGES_BY_DATA_KIND.runtimeUrlData
              }

              if (
                // If the prerender ends before the prefetch stage (because
                // render that only produces an App Shell), this cache should be
                // omitted entirely.
                stagedRendering.finalStage !== null &&
                stagedRendering.finalStage < prefetchStage
              ) {
                debug?.(
                  logPrefix,
                  'omitting entry',
                  serializedCacheKey,
                  'from shell due to short stale value:',
                  collectedCacheResult.entry.stale
                )

                // The entry was omitted only because this prerender ends before
                // the prefetch stage. Neither static nor runtime app shells
                // include it, so it does not count as a runtime data access.
                return {
                  type: 'prerender-dynamic',
                  hangingPromise: makePrefetchHangingPromise(
                    prerenderStore.renderSignal,
                    workStore.route,
                    'dynamic "use cache"'
                  ),
                }
              } else {
                debug?.(
                  logPrefix,
                  'delaying entry',
                  serializedCacheKey,
                  'until the prefetch stage due to short stale value:',
                  collectedCacheResult.entry.stale
                )
                await stagedRendering.waitForStage(prefetchStage)
              }
            }
          }

          break
        }
        case 'request': {
          if (isValidationRender(workUnitStore)) {
            let stage: AdvanceableRenderStage
            if (!isPrefetchable) {
              // An unprefetchable entry is excluded from prerenders, so it
              // resolves in the dynamic stage.
              stage = RenderStage.Dynamic
            } else {
              // If the entry would be be excluded from the shell, treat it as
              // if it were static URL data. (Note that this is still correct
              // without PPF or in static shell validation, where we don't use
              // runtime shells and include static URL data)
              trackIncompatibleShellContent(
                workUnitStore,
                '"use cache" excluded from app shells due to a short staletime'
              )
              stage =
                RENDER_STAGES_BY_DATA_KIND.staticUrlData[
                  workUnitStore.needsRuntimeShell ? 'runtime' : 'static'
                ]
            }

            debug?.(
              logPrefix,
              'delaying entry',
              serializedCacheKey,
              `until after the ${RenderStage[stage]} stage due to short stale value:`,
              collectedCacheResult.entry.stale
            )
            if (cacheSignalReadActive) {
              cacheSignal?.endRead()
              cacheSignalReadActive = false
            }
            await makeDevtoolsIOAwarePromise(undefined, workUnitStore, stage)
          }
          break
        }
        case 'prerender-legacy':
        case 'cache':
        case 'private-cache':
        case 'unstable-cache':
        case 'build-time-generator':
          break
        default:
          workUnitStore satisfies never
      }
    }

    debug?.(logPrefix, 'Resume Data Cache entry found', serializedCacheKey)

    if (
      collectedCacheResult.readRootParamNames &&
      collectedCacheResult.readRootParamNames.size > 0
    ) {
      addKnownRootParamNames(
        cacheContext.functionId,
        collectedCacheResult.readRootParamNames
      )
    }

    // We want to make sure we only propagate cache life & tags if the entry was
    // *not* omitted from the prerender. So we only do this after the above
    // early returns.
    propagateCacheEntryMetadata(cacheContext, {
      tags: collectedCacheResult.entry.tags,
      revalidate: collectedCacheResult.entry.revalidate,
      expire: collectedCacheResult.entry.expire,
      stale: collectedCacheResult.entry.stale,
      timestamp: collectedCacheResult.entry.timestamp,
      hasExplicitRevalidate: collectedCacheResult.hasExplicitRevalidate,
      hasExplicitExpire: collectedCacheResult.hasExplicitExpire,
      readRootParamNames: collectedCacheResult.readRootParamNames,
      dynamicNestedCacheError: collectedCacheResult.dynamicNestedCacheError,
    })

    const [streamA, streamB] = collectedCacheResult.entry.value.tee()
    collectedCacheResult.entry.value = streamB
    const stream =
      cacheSignalReadActive && cacheSignal
        ? createTrackedReadableStream(streamA, cacheSignal)
        : streamA
    cacheSignalReadActive = false
    return { type: 'stream', stream }
  } finally {
    if (cacheSignalReadActive) {
      cacheSignal?.endRead()
    }
  }
}

/**
 * A consumer can fill an absent or omitted slot, or replace the entry it read.
 * It cannot overwrite an entry another consumer saved in the meantime.
 */
function canWriteResumeDataCacheEntry(
  resumeDataCache: ResumeDataCache,
  serializedCacheKey: string,
  expectedResumeDataCacheValue: ResumeDataCacheValue
): boolean {
  const resumeDataCacheValue = resumeDataCache.cache.get(serializedCacheKey)
  return (
    resumeDataCacheValue === undefined ||
    resumeDataCacheValue === FALLBACK_PARAMS ||
    resumeDataCacheValue === RUNTIME_DATA ||
    resumeDataCacheValue === SESSION_DATA ||
    resumeDataCacheValue === expectedResumeDataCacheValue
  )
}

/**
 * This consumer saves generated data before handler writes settle. It cannot
 * replace an entry saved after it read the RDC.
 */
function saveSharedCacheEntryToResumeDataCache(
  serializedCacheKey: string,
  sharedCacheEntry: SharedCacheEntry,
  resumeDataCache: ResumeDataCache,
  logPrefix: string,
  expectedResumeDataCacheValue: ResumeDataCacheValue
): void {
  if (
    !resumeDataCache.mutable ||
    !canWriteResumeDataCacheEntry(
      resumeDataCache,
      serializedCacheKey,
      expectedResumeDataCacheValue
    )
  ) {
    return
  }

  resumeDataCache.cache.set(
    serializedCacheKey,
    sharedCacheEntry.forkCollectedResult()
  )
  debug?.(
    logPrefix,
    'saved generated entry to consumer Resume Data Cache',
    serializedCacheKey
  )
}

async function readOrFillCache(
  cacheContext: CacheContext,
  encodedCacheInvocation: EncodedCacheInvocation,
  cacheInvocationKeys: CacheInvocationKeys,
  resumeDataCache: ResumeDataCache | null,
  resumeDataCacheValue: ResumeDataCacheValue
): Promise<CacheResult> {
  const { workStore } = cacheContext
  const state = getCacheDeduplicationState(workStore, cacheInvocationKeys)
  let lookup: CacheHandlerLookup | undefined
  try {
    while (true) {
      const completed = getReusableCacheInvocation(state, cacheContext)
      if (completed?.type === 'completed') {
        return serveGeneratedCacheEntry(
          completed.result.entry,
          cacheContext,
          cacheInvocationKeys.serializedCacheKey,
          resumeDataCache,
          resumeDataCacheValue
        )
      }

      let lookupResult: CacheHandlerLookupResult | undefined
      lookup = undefined
      // A direct caller can serve stale data while a nested cache waits for
      // fresh generation. Pending generation must not bypass this lookup.
      if (!shouldForceRevalidate(workStore, cacheContext.outerWorkUnitStore)) {
        lookup =
          state.cacheHandlerLookup ??
          startCacheHandlerLookup(state, cacheContext)
        const cacheSignal = getCacheSignal(cacheContext.outerWorkUnitStore)
        cacheSignal?.beginRead()
        try {
          lookupResult = await lookup.result
        } catch (error) {
          cacheSignal?.endRead()
          throw error
        }
        const result = await consumeCacheHandlerEntry(
          lookupResult,
          lookup,
          state,
          cacheContext,
          encodedCacheInvocation,
          resumeDataCache,
          resumeDataCacheValue
        )
        if (result !== undefined) {
          return result
        }
      }

      // Reuse a pending or completed intra-request invocation before retrying
      // an obsolete cache handler lookup. Generated entries can be available
      // while cache handler writes remain pending.
      let cachedInvocation = getReusableCacheInvocation(state, cacheContext)
      if (cachedInvocation === undefined) {
        if (lookup !== undefined && state.cacheHandlerLookup !== lookup) {
          continue
        }
        cachedInvocation = startCacheInvocation(
          state,
          lookup,
          lookupResult,
          cacheContext,
          encodedCacheInvocation
        )
      }
      if (cachedInvocation.type === 'completed') {
        return serveGeneratedCacheEntry(
          cachedInvocation.result.entry,
          cacheContext,
          cacheInvocationKeys.serializedCacheKey,
          resumeDataCache,
          resumeDataCacheValue
        )
      }
      const result = await readPendingCacheInvocation(
        cachedInvocation,
        cacheContext,
        cacheInvocationKeys.serializedCacheKey,
        resumeDataCache,
        resumeDataCacheValue
      )
      if (result.type === 'retry-lookup') {
        continue
      }
      return result
    }
  } finally {
    releaseCacheHandlerLookup(state, lookup, cacheContext)
  }
}

function getCacheDeduplicationState(
  workStore: WorkStore,
  cacheInvocationKeys: CacheInvocationKeys
): CacheDeduplicationState {
  const states = (workStore.cacheDeduplicationStates ??= new Map<
    string,
    CacheDeduplicationState
  >())
  let state = states.get(cacheInvocationKeys.serializedCacheKey)
  if (state === undefined) {
    state = {
      cacheInvocationKeys,
      cacheHandlerLookup: undefined,
      cacheInvocation: undefined,
    }
    states.set(cacheInvocationKeys.serializedCacheKey, state)
  }
  return state
}

/**
 * This helper owns the lookup's active cache-signal read. The read includes
 * asynchronous tag checks so cache warming cannot finish before validation.
 */
async function consumeCacheHandlerEntry(
  lookupResult: CacheHandlerLookupResult,
  lookup: CacheHandlerLookup,
  state: CacheDeduplicationState,
  cacheContext: CacheContext,
  encodedCacheInvocation: EncodedCacheInvocation,
  resumeDataCache: ResumeDataCache | null,
  resumeDataCacheValue: ResumeDataCacheValue
): Promise<CacheResult | undefined> {
  const { workStore } = cacheContext
  const workUnitStore = cacheContext.outerWorkUnitStore
  const cacheSignal = getCacheSignal(workUnitStore)
  let cacheSignalReadActive = true
  let stream: ReadableStream<Uint8Array> | undefined
  try {
    const { entry } = lookupResult
    if (
      entry === undefined ||
      !(await isValidCacheHandlerEntry(entry, cacheContext))
    ) {
      return undefined
    }
    // Snapshot freshness before stage waits. The waits control when rendering
    // can use this entry, not which version this invocation selected.
    const classification = classifyCacheHandlerHit(entry, cacheContext)
    const { serializedCacheKey } = lookup.cacheInvocationKeys
    if (entry.revalidate === 0 || entry.expire < MIN_PRERENDERABLE_EXPIRE) {
      switch (workUnitStore.type) {
        case 'prerender':
          if (resumeDataCache?.mutable) {
            resumeDataCache.cache.set(serializedCacheKey, SESSION_DATA)
          }
          return {
            type: 'prerender-dynamic',
            hangingPromise: makeSessionDataHangingPromise<never>(
              workUnitStore.renderSignal,
              workStore.route,
              'dynamic "use cache"',
              workUnitStore
            ),
          }
        case 'request':
          if (isValidationRender(workUnitStore)) {
            // Validation can advance this stage only after cache reads finish.
            cacheSignal?.endRead()
            cacheSignalReadActive = false
            await makeDevtoolsIOAwarePromise(
              undefined,
              workUnitStore,
              RENDER_STAGES_BY_DATA_KIND.sessionData
            )
          }
          break
        case 'prerender-runtime':
        case 'prerender-legacy':
        case 'cache':
        case 'private-cache':
        case 'unstable-cache':
        case 'build-time-generator':
          break
        default:
          workUnitStore satisfies never
      }
    }
    if (entry.stale < MIN_SHELL_STALE) {
      switch (workUnitStore.type) {
        case 'request':
          if (isValidationRender(workUnitStore)) {
            if (cacheSignalReadActive) {
              cacheSignal?.endRead()
              cacheSignalReadActive = false
            }
            let stage: AdvanceableRenderStage
            if (entry.stale < MIN_PREFETCHABLE_STALE) {
              stage = RenderStage.Dynamic
            } else {
              trackIncompatibleShellContent(
                workUnitStore,
                '"use cache" excluded from app shells due to a short staletime'
              )
              stage =
                RENDER_STAGES_BY_DATA_KIND.staticUrlData[
                  workUnitStore.needsRuntimeShell ? 'runtime' : 'static'
                ]
            }
            await makeDevtoolsIOAwarePromise(undefined, workUnitStore, stage)
          }
          break
        case 'prerender':
        case 'prerender-runtime':
        case 'prerender-legacy':
        case 'cache':
        case 'private-cache':
        case 'unstable-cache':
        case 'build-time-generator':
          break
        default:
          workUnitStore satisfies never
      }
    }
    if (classification.requiresGeneration) {
      return undefined
    }
    const [, servingEntry] = cloneCacheEntry(entry)
    stream = servingEntry.value
    const metadata = getCacheHandlerMetadata(entry, cacheContext)
    maybePropagateCacheEntryMetadata(cacheContext, metadata)
    if (resumeDataCache?.mutable) {
      if (
        canWriteResumeDataCacheEntry(
          resumeDataCache,
          serializedCacheKey,
          resumeDataCacheValue
        )
      ) {
        const [served, saved] = cloneCacheEntry(servingEntry)
        stream = served.value
        resumeDataCache.cache.set(
          serializedCacheKey,
          Promise.resolve({
            entry: saved,
            hasExplicitRevalidate: metadata.hasExplicitRevalidate,
            hasExplicitExpire: metadata.hasExplicitExpire,
            readRootParamNames: metadata.readRootParamNames,
            dynamicNestedCacheError: metadata.dynamicNestedCacheError,
          })
        )
      }
      if (cacheSignalReadActive) {
        if (cacheSignal) {
          stream = createTrackedReadableStream(stream, cacheSignal)
        }
        cacheSignalReadActive = false
      }
    }
    if (classification.requiresRevalidation) {
      startBackgroundCacheRevalidation(
        state,
        lookup,
        lookupResult,
        entry,
        cacheContext,
        encodedCacheInvocation
      )
    }
    return { type: 'stream', stream }
  } catch (error) {
    stream?.cancel().catch(ignoreReject)
    throw error
  } finally {
    if (cacheSignalReadActive) {
      cacheSignal?.endRead()
    }
  }
}

type PendingCacheInvocationReadResult = CacheResult | CacheLookupRetry

async function readPendingCacheInvocation(
  invocation: PendingCacheInvocation,
  cacheContext: CacheContext,
  serializedCacheKey: string,
  resumeDataCache: ResumeDataCache | null,
  resumeDataCacheValue: ResumeDataCacheValue
): Promise<PendingCacheInvocationReadResult> {
  const cacheSignal = getCacheSignal(cacheContext.outerWorkUnitStore)
  cacheSignal?.beginRead()
  try {
    const result = await invocation.result
    if (result.type === 'retry-lookup') {
      return result
    }
    if (result.type === 'prerender-dynamic') {
      if (resumeDataCache?.mutable) {
        resumeDataCache.cache.set(serializedCacheKey, result.reason)
      }
      return {
        type: 'prerender-dynamic',
        hangingPromise: result.hangingPromise,
      }
    }
    return serveGeneratedCacheEntry(
      result.entry,
      cacheContext,
      serializedCacheKey,
      resumeDataCache,
      resumeDataCacheValue
    )
  } finally {
    cacheSignal?.endRead()
  }
}

function serveGeneratedCacheEntry(
  entry: SharedCacheEntry,
  cacheContext: CacheContext,
  serializedCacheKey: string,
  resumeDataCache: ResumeDataCache | null,
  resumeDataCacheValue: ResumeDataCacheValue
): CacheStreamResult {
  const cacheSignal = getCacheSignal(cacheContext.outerWorkUnitStore)
  cacheSignal?.beginRead()
  let cacheSignalReadActive = true
  let stream: ReadableStream<Uint8Array> | undefined
  try {
    stream = entry.fork()
    if (!cacheContext.workStore.isDraftMode && resumeDataCache?.mutable) {
      saveSharedCacheEntryToResumeDataCache(
        serializedCacheKey,
        entry,
        resumeDataCache,
        cacheContext.logPrefix,
        resumeDataCacheValue
      )
    }
    // Collection completes this read. Cache handler writes must not delay
    // rendering or keep this invocation's cache signal active.
    entry.pendingMetadata
      .then((metadata) => {
        maybePropagateCacheEntryMetadata(cacheContext, metadata)
      })
      .finally(() => {
        cacheSignal?.endRead()
      })
      .catch(ignoreReject)
    cacheSignalReadActive = false
    return { type: 'stream', stream }
  } catch (error) {
    stream?.cancel().catch(ignoreReject)
    throw error
  } finally {
    if (cacheSignalReadActive) {
      cacheSignal?.endRead()
    }
  }
}

function startCacheInvocation(
  state: CacheDeduplicationState,
  lookup: CacheHandlerLookup | undefined,
  lookupResult: CacheHandlerLookupResult | undefined,
  cacheContext: CacheContext,
  encodedCacheInvocation: EncodedCacheInvocation
): PendingCacheInvocation {
  const resultResolvers = createPromiseWithResolvers<CacheInvocationResult>()
  const completionResolvers = createPromiseWithResolvers<void>()
  const pending: PendingCacheInvocation = {
    type: 'pending',
    result: resultResolvers.promise,
    completion: completionResolvers.promise,
  }
  const reservedLookup = state.cacheHandlerLookup
  const keys =
    lookupResult === undefined
      ? state.cacheInvocationKeys
      : {
          ...lookup!.cacheInvocationKeys,
          cacheHandlerKey: lookupResult.cacheHandlerKey,
        }
  // Register before any asynchronous work so concurrent local callers can
  // acquire this invocation while generation or persistence is pending.
  state.cacheInvocation = pending
  pending.result.catch(ignoreReject)
  pending.completion.catch(ignoreReject)
  cacheContext.workStore.pendingRevalidateWrites ??= []
  cacheContext.workStore.pendingRevalidateWrites.push(pending.completion)

  async function run(): Promise<void> {
    try {
      await refreshCacheTags(cacheContext)
      const shareGeneration = canShareCacheGeneration(cacheContext)
      let generation = shareGeneration
        ? getPendingCacheGeneration(keys, lookup, lookupResult)
        : undefined
      if (generation === undefined) {
        const recordedGenerationCompletion =
          getRecordedCacheGenerationCompletion(lookupResult)
        if (recordedGenerationCompletion !== undefined) {
          // Generation records its read root params before cache handler writes
          // finish. A lookup with a corrected cache handler key must wait for
          // both the redirect and cache entry writes to settle.
          await recordedGenerationCompletion.catch(ignoreReject)
        }
        const updatedKey = getUpdatedCacheHandlerKey(keys, cacheContext)
        const recordedGenerationKey =
          lookupResult?.redirectedKeyGenerationCompletion !== undefined
            ? lookupResult.cacheHandlerKey
            : lookup?.cacheInvocationKeys.cacheHandlerKey
        if (
          updatedKey !== keys.cacheHandlerKey ||
          (recordedGenerationCompletion !== undefined &&
            recordedGenerationKey !== keys.cacheHandlerKey)
        ) {
          if (state.cacheInvocation === pending) {
            state.cacheInvocationKeys = { ...keys, cacheHandlerKey: updatedKey }
            if (state.cacheHandlerLookup === reservedLookup) {
              state.cacheHandlerLookup = undefined
            }
            state.cacheInvocation = undefined
          }
          resultResolvers.resolve({ type: 'retry-lookup' })
          completionResolvers.resolve()
          return
        }
        generation = shareGeneration
          ? pendingCacheGenerations.get(keys.cacheHandlerKey)
          : undefined
      }
      const joined = generation !== undefined
      generation ??= startCacheGeneration(
        keys,
        cacheContext,
        encodedCacheInvocation
      )
      const completion = joined
        ? generation.completion.catch(ignoreReject)
        : generation.completion
      const result = await generation.result
      if (joined) {
        if (result.type === 'cached') {
          // A request that joins generation checks read root params after cache
          // handler writes settle. A failed write does not invalidate the
          // generated cache entry.
          const metadata = await result.entry.pendingCompletion
          if (metadata.readRootParamNames) {
            addKnownRootParamNames(
              cacheContext.functionId,
              metadata.readRootParamNames
            )
          }
        }
        const updatedKey = getUpdatedCacheHandlerKey(
          generation.cacheInvocationKeys,
          cacheContext
        )
        if (updatedKey !== generation.cacheInvocationKeys.cacheHandlerKey) {
          await completion
          if (state.cacheInvocation === pending) {
            state.cacheInvocationKeys = {
              ...generation.cacheInvocationKeys,
              cacheHandlerKey: getUpdatedCacheHandlerKey(
                generation.cacheInvocationKeys,
                cacheContext
              ),
            }
            if (state.cacheHandlerLookup === reservedLookup) {
              state.cacheHandlerLookup = undefined
            }
            state.cacheInvocation = undefined
          }
          resultResolvers.resolve({ type: 'retry-lookup' })
          completionResolvers.resolve()
          return
        }
      }
      resultResolvers.resolve(result)
      if (result.type === 'prerender-dynamic') {
        if (state.cacheInvocation === pending) {
          if (state.cacheHandlerLookup === reservedLookup) {
            state.cacheHandlerLookup = undefined
          }
          state.cacheInvocation = undefined
        }
      } else {
        const metadata = await result.entry.pendingCompletion
        if (state.cacheInvocation === pending) {
          state.cacheInvocationKeys = {
            ...generation.cacheInvocationKeys,
            cacheHandlerKey: getUpdatedCacheHandlerKey(
              generation.cacheInvocationKeys,
              cacheContext
            ),
          }
          if (state.cacheHandlerLookup === reservedLookup) {
            state.cacheHandlerLookup = undefined
          }
          state.cacheInvocation = shouldRetainCacheResult(cacheContext)
            ? {
                type: 'completed',
                completion: pending.completion,
                result,
                metadata,
              }
            : undefined
        }
      }
      await completion
      completionResolvers.resolve()
    } catch (error) {
      // Preserve completed entries and newer invocations during failure
      // cleanup. A cache handler write can fail after its generated entry was
      // retained.
      if (state.cacheInvocation === pending) {
        if (
          !shouldRetainCacheResult(cacheContext) &&
          state.cacheHandlerLookup === reservedLookup
        ) {
          state.cacheHandlerLookup = undefined
        }
        state.cacheInvocation = undefined
      }
      resultResolvers.reject(error)
      completionResolvers.reject(error)
    }
  }
  void run()
  return pending
}

function startCacheGeneration(
  cacheInvocationKeys: CacheInvocationKeys,
  cacheContext: CacheContext,
  encodedCacheInvocation: EncodedCacheInvocation
): CacheGeneration {
  const resultResolvers = createPromiseWithResolvers<SharedCacheResult>()
  const completionResolvers =
    createPromiseWithResolvers<CacheGenerationCompletion>()
  const generation: CacheGeneration = {
    cacheInvocationKeys,
    result: resultResolvers.promise,
    completion: completionResolvers.promise,
  }
  generation.result.catch(ignoreReject)
  generation.completion.catch(ignoreReject)
  if (canShareCacheGeneration(cacheContext)) {
    pendingCacheGenerations.set(cacheInvocationKeys.cacheHandlerKey, generation)
  }
  Promise.resolve()
    .then(async (): Promise<CacheGenerationCompletion> => {
      const generated = await generateCacheEntry(
        cacheContext.workStore,
        cacheContext,
        cacheContext.clientReferenceManifest,
        encodedCacheInvocation.encodedCacheKeyParts,
        encodedCacheInvocation.functionToCache,
        cacheContext.timeoutError,
        cacheContext.deadlockError
      )
      if (generated.type === 'prerender-dynamic') {
        resultResolvers.resolve(generated)
        return 'prerender-dynamic'
      }
      const write =
        cacheContext.cacheHandler !== undefined &&
        !cacheContext.workStore.isDraftMode
          ? saveToCacheHandler(
              cacheContext.cacheHandler,
              cacheContext.functionId,
              cacheInvocationKeys.cacheHandlerKeyBase,
              generated.pendingCacheResult.then(cloneCollectedCacheResult),
              cacheContext.outerWorkUnitStore.rootParams
            )
          : undefined
      const entry = new SharedCacheEntry(
        generated.stream,
        generated.pendingCacheResult,
        write
      )
      resultResolvers.resolve({ type: 'cached', entry })
      await entry.pendingCompletion
      await write
      return 'cached'
    })
    .then(
      (completion) => {
        if (
          pendingCacheGenerations.get(cacheInvocationKeys.cacheHandlerKey) ===
          generation
        ) {
          pendingCacheGenerations.delete(cacheInvocationKeys.cacheHandlerKey)
        }
        completionResolvers.resolve(completion)
      },
      (error) => {
        if (
          pendingCacheGenerations.get(cacheInvocationKeys.cacheHandlerKey) ===
          generation
        ) {
          pendingCacheGenerations.delete(cacheInvocationKeys.cacheHandlerKey)
        }
        resultResolvers.reject(error)
        completionResolvers.reject(error)
      }
    )
  return generation
}

function startBackgroundCacheRevalidation(
  state: CacheDeduplicationState,
  initialLookup: CacheHandlerLookup,
  initialLookupResult: CacheHandlerLookupResult,
  initialEntry: CacheEntry,
  cacheContext: CacheContext,
  encodedCacheInvocation: EncodedCacheInvocation
): void {
  // The async function starts synchronously. It must acquire local work before
  // the foreground caller can release the lookup it used to serve stale data.
  const completion = revalidate()
  completion.catch((error) => {
    debug?.(
      cacheContext.logPrefix,
      'background cache revalidation failed',
      error
    )
  })
  cacheContext.workStore.pendingRevalidateWrites ??= []
  cacheContext.workStore.pendingRevalidateWrites.push(completion)

  async function revalidate(): Promise<void> {
    let lookup: CacheHandlerLookup | undefined = initialLookup
    let lookupResult: CacheHandlerLookupResult | undefined = initialLookupResult
    let entry: CacheEntry | undefined = initialEntry
    let shouldReadCacheHandler = false
    try {
      while (true) {
        let cachedInvocation = getReusableCacheInvocation(state, cacheContext)
        if (shouldReadCacheHandler && cachedInvocation?.type !== 'completed') {
          lookup = undefined
          lookupResult = undefined
          entry = undefined
          if (
            !shouldForceRevalidate(
              cacheContext.workStore,
              cacheContext.outerWorkUnitStore
            )
          ) {
            lookup =
              state.cacheHandlerLookup ??
              startCacheHandlerLookup(state, cacheContext)
            lookupResult = await lookup.result
            const candidate = lookupResult.entry
            if (
              candidate !== undefined &&
              (await isValidCacheHandlerEntry(candidate, cacheContext))
            ) {
              entry = candidate
              const classification = classifyCacheHandlerHit(
                candidate,
                cacheContext
              )
              if (
                !classification.requiresGeneration &&
                !classification.requiresRevalidation
              ) {
                return
              }
            }
          }
          shouldReadCacheHandler = false
          cachedInvocation = getReusableCacheInvocation(state, cacheContext)
        }

        if (cachedInvocation?.type === 'completed') {
          await cachedInvocation.completion
          return
        }
        if (cachedInvocation?.type === 'pending') {
          const result = await cachedInvocation.result
          await cachedInvocation.completion
          if (result.type === 'retry-lookup') {
            shouldReadCacheHandler = true
            continue
          }
          return
        }

        const keys =
          lookupResult === undefined
            ? state.cacheInvocationKeys
            : {
                ...lookup!.cacheInvocationKeys,
                cacheHandlerKey: lookupResult.cacheHandlerKey,
              }
        const pendingGeneration = canShareCacheGeneration(cacheContext)
          ? getPendingCacheGeneration(keys, lookup, lookupResult)
          : undefined
        const generationCompletion =
          getRecordedCacheGenerationCompletion(lookupResult)
        if (
          pendingGeneration === undefined &&
          entry !== undefined &&
          generationCompletion !== undefined &&
          keys.cacheHandlerKey === state.cacheInvocationKeys.cacheHandlerKey &&
          !shouldForceRevalidate(
            cacheContext.workStore,
            cacheContext.outerWorkUnitStore
          )
        ) {
          // A stale cache hit can arrive after concurrent revalidation has
          // completed its cache handler writes. Check that completion before
          // starting another background revalidation for the same cache handler
          // key.
          const generationResult =
            await generationCompletion.catch(ignoreReject)
          const entryStillValid = await isValidCacheHandlerEntry(
            entry,
            cacheContext
          )

          // These awaits can overlap another invocation or generation. Acquire
          // that work instead of using an earlier completion to skip it.
          if (getReusableCacheInvocation(state, cacheContext) !== undefined) {
            continue
          }
          const currentGeneration = canShareCacheGeneration(cacheContext)
            ? getPendingCacheGeneration(keys, lookup, lookupResult)
            : undefined
          const generationKey =
            lookupResult?.redirectedKeyGenerationCompletion !== undefined
              ? lookupResult.cacheHandlerKey
              : lookup!.cacheInvocationKeys.cacheHandlerKey
          // Cache handler writes for the initial key do not establish that a
          // redirected key has been revalidated for these root param values.
          const handlerKeyMatches =
            generationKey === keys.cacheHandlerKey &&
            keys.cacheHandlerKey ===
              state.cacheInvocationKeys.cacheHandlerKey &&
            getUpdatedCacheHandlerKey(keys, cacheContext) ===
              keys.cacheHandlerKey
          if (
            currentGeneration === undefined &&
            generationResult === 'cached' &&
            entryStillValid &&
            handlerKeyMatches &&
            !shouldForceRevalidate(
              cacheContext.workStore,
              cacheContext.outerWorkUnitStore
            )
          ) {
            return
          }
        }

        if (lookup !== undefined && state.cacheHandlerLookup !== lookup) {
          shouldReadCacheHandler = true
          continue
        }
        // Register the intra-request invocation before starting or joining
        // generation. Concurrent invocations can then reuse this work while
        // writes finish.
        startCacheInvocation(
          state,
          lookup,
          lookupResult,
          cacheContext,
          encodedCacheInvocation
        )
      }
    } finally {
      releaseCacheHandlerLookup(state, lookup, cacheContext)
    }
  }
}

function startCacheHandlerLookup(
  state: CacheDeduplicationState,
  cacheContext: CacheContext
): CacheHandlerLookup {
  const lookup: CacheHandlerLookup = {
    cacheInvocationKeys: state.cacheInvocationKeys,
    // Await the native async promise directly. Extra rejection handlers cause
    // V8 to omit the awaiting caller from handler error stacks.
    result: readCacheHandler(state, cacheContext),
  }
  state.cacheHandlerLookup = lookup
  return lookup
}

async function readCacheHandler(
  state: CacheDeduplicationState,
  cacheContext: CacheContext
): Promise<CacheHandlerLookupResult> {
  // The lookup must be registered before a handler can start other cache calls.
  await undefined
  const lookup = state.cacheHandlerLookup!
  const { cacheHandler } = cacheContext
  const initialKeys = lookup.cacheInvocationKeys
  const rootParams = cacheContext.outerWorkUnitStore.rootParams
  let key = initialKeys.cacheHandlerKey
  let followedRedirect = false
  let retried = false
  // The redirect can read a second key. A retry starts only after its captured
  // generation completes, so each key needs one completion reference.
  let initialKeyGenerationCompletion:
    | Promise<CacheGenerationCompletion>
    | undefined
  let redirectedKeyGenerationCompletion:
    | Promise<CacheGenerationCompletion>
    | undefined
  try {
    await refreshCacheTags(cacheContext)
    while (true) {
      // A cache handler get() can return a cache miss after concurrent
      // generation completes its cache handler writes. Record the pending
      // generation so that miss can retry get() with this request's implicit
      // tags.
      const generation = canShareCacheGeneration(cacheContext)
        ? pendingCacheGenerations.get(key)
        : undefined
      const completion = generation?.completion
      if (completion !== undefined) {
        if (followedRedirect) {
          redirectedKeyGenerationCompletion = completion
        } else {
          initialKeyGenerationCompletion = completion
        }
      }
      // A retry starts after the recorded generation completes. Retain its
      // completion when the retry finds no new pending generation.
      const implicitTags =
        cacheContext.outerWorkUnitStore.implicitTags?.tags ?? []
      const entry = await cacheHandler?.get(key, implicitTags)
      if (
        entry === undefined &&
        !retried &&
        completion !== undefined &&
        pendingCacheGenerations.get(key)?.completion !== completion &&
        !shouldForceRevalidate(
          cacheContext.workStore,
          cacheContext.outerWorkUnitStore
        ) &&
        (await completion.catch(ignoreReject)) === 'cached'
      ) {
        retried = true
        continue
      }
      if (entry !== undefined && rootParams && !followedRedirect) {
        const names = new Set<string>()
        for (const tag of entry.tags) {
          if (tag.startsWith(NEXT_CACHE_ROOT_PARAM_TAG_ID)) {
            names.add(tag.slice(NEXT_CACHE_ROOT_PARAM_TAG_ID.length))
          }
        }
        if (names.size > 0) {
          addKnownRootParamNames(cacheContext.functionId, names)
          key =
            initialKeys.cacheHandlerKeyBase +
            computeRootParamsCacheKeySuffix(rootParams, names)
          followedRedirect = true
          continue
        }
      }
      if (state.cacheHandlerLookup === lookup) {
        state.cacheInvocationKeys = { ...initialKeys, cacheHandlerKey: key }
      }
      return {
        cacheHandlerKey: key,
        entry:
          entry === undefined ? undefined : { ...entry, tags: [...entry.tags] },
        initialKeyGenerationCompletion,
        redirectedKeyGenerationCompletion,
      }
    }
  } catch (error) {
    if (state.cacheHandlerLookup === lookup) {
      state.cacheHandlerLookup = undefined
    }
    throw error
  }
}

async function refreshCacheTags(cacheContext: CacheContext): Promise<void> {
  const refresh = cacheContext.workStore.refreshTagsByCacheKind.get(
    cacheContext.handlerKind
  )
  if (refresh && !isResolvedLazyResult(refresh)) {
    await refresh
  }
}

function releaseCacheHandlerLookup(
  state: CacheDeduplicationState,
  lookup: CacheHandlerLookup | undefined,
  cacheContext: CacheContext
): void {
  if (
    !shouldRetainCacheResult(cacheContext) &&
    state.cacheInvocation?.type !== 'pending' &&
    state.cacheHandlerLookup === lookup
  ) {
    state.cacheHandlerLookup = undefined
  }
}

function getReusableCacheInvocation(
  state: CacheDeduplicationState,
  cacheContext: CacheContext
): CacheInvocation | undefined {
  const cachedInvocation = state.cacheInvocation
  if (cachedInvocation === undefined || cachedInvocation.type === 'pending') {
    return cachedInvocation
  }
  const { workStore, outerWorkUnitStore, logPrefix } = cacheContext
  const implicitTags = outerWorkUnitStore.implicitTags?.tags ?? []
  // A server action can call updateTag() after this request generated the
  // entry. Recheck the request's revalidated tags before reusing that entry.
  // Earlier implicit-tag invalidations apply to stored handler entries. This
  // entry was generated during this request.
  if (
    !shouldForceRevalidate(workStore, outerWorkUnitStore) &&
    !shouldDiscardCacheEntry(
      cachedInvocation.metadata,
      workStore,
      outerWorkUnitStore,
      implicitTags,
      0,
      logPrefix
    )
  ) {
    return cachedInvocation
  }
  if (state.cacheInvocation === cachedInvocation) {
    state.cacheInvocation = undefined
  }
  return undefined
}

function shouldRetainCacheResult(cacheContext: CacheContext): boolean {
  // Private caches have no production handler. Custom-handler reads can require
  // remote I/O. Built-in public reads need no extra retained stream branches.
  return (
    cacheContext.kind === 'private' ||
    !isBuiltInCacheHandler(cacheContext.handlerKind)
  )
}

function canShareCacheGeneration(cacheContext: CacheContext): boolean {
  // Draft generation can contain unpublished content. Production private caches
  // can read request data; development keys them by cookies and headers.
  return (
    !cacheContext.workStore.isDraftMode &&
    (cacheContext.kind !== 'private' || !!process.env.__NEXT_DEV_SERVER)
  )
}

function getPendingCacheGeneration(
  keys: CacheInvocationKeys,
  lookup: CacheHandlerLookup | undefined,
  lookupResult: CacheHandlerLookupResult | undefined
): CacheGeneration | undefined {
  const generation = pendingCacheGenerations.get(keys.cacheHandlerKey)
  if (generation !== undefined) {
    return generation
  }
  // A root-param redirect can change the handler key while cache handler writes
  // remain pending. Match the recorded completion to join generation under the
  // initial key; a completed generation cannot supply data here.
  if (
    lookup !== undefined &&
    lookupResult?.initialKeyGenerationCompletion !== undefined
  ) {
    const initialGeneration = pendingCacheGenerations.get(
      lookup.cacheInvocationKeys.cacheHandlerKey
    )
    if (
      initialGeneration?.completion ===
      lookupResult.initialKeyGenerationCompletion
    ) {
      return initialGeneration
    }
  }
  return undefined
}

function getRecordedCacheGenerationCompletion(
  lookupResult: CacheHandlerLookupResult | undefined
): Promise<CacheGenerationCompletion> | undefined {
  return (
    lookupResult?.redirectedKeyGenerationCompletion ??
    lookupResult?.initialKeyGenerationCompletion
  )
}

function getUpdatedCacheHandlerKey(
  cacheInvocationKeys: CacheInvocationKeys,
  cacheContext: CacheContext
): string {
  const rootParams = cacheContext.outerWorkUnitStore.rootParams
  const names = knownRootParamsByFunctionId.get(cacheContext.functionId)
  return names && rootParams
    ? cacheInvocationKeys.cacheHandlerKeyBase +
        computeRootParamsCacheKeySuffix(rootParams, names)
    : cacheInvocationKeys.cacheHandlerKey
}

async function isValidCacheHandlerEntry(
  entry: CacheEntry,
  cacheContext: CacheContext
): Promise<boolean> {
  const { workStore, outerWorkUnitStore, logPrefix } = cacheContext
  return (
    !shouldForceRevalidate(workStore, outerWorkUnitStore) &&
    !shouldDiscardCacheEntry(
      entry,
      workStore,
      outerWorkUnitStore,
      outerWorkUnitStore.implicitTags?.tags ?? [],
      await getImplicitTagsExpiration(cacheContext),
      logPrefix
    )
  )
}

async function getImplicitTagsExpiration(
  cacheContext: CacheContext
): Promise<number> {
  const lazyExpiration =
    cacheContext.outerWorkUnitStore.implicitTags?.expirationsByCacheKind.get(
      cacheContext.handlerKind
    )
  if (lazyExpiration === undefined) {
    return 0
  }

  const expiration = isResolvedLazyResult(lazyExpiration)
    ? lazyExpiration.value
    : await lazyExpiration
  // Infinity delegates implicit-tag validation to this WorkStore's get().
  return expiration < Infinity ? expiration : 0
}

interface CacheHandlerEntryClassification {
  readonly requiresGeneration: boolean
  readonly requiresRevalidation: boolean
}

function classifyCacheHandlerHit(
  entry: CacheEntry,
  cacheContext: CacheContext
): CacheHandlerEntryClassification {
  const currentTime = performance.timeOrigin + performance.now()
  const workUnitStore = cacheContext.outerWorkUnitStore
  const expired =
    currentTime >
    entry.timestamp +
      (process.env.__NEXT_DEV_SERVER
        ? Math.max(entry.expire, MIN_PRERENDERABLE_EXPIRE)
        : entry.expire) *
        1000
  const stale = currentTime > entry.timestamp + entry.revalidate * 1000

  // Development retains short-lived entries for warm reloads. Each request
  // refreshes them in the background so subsequent reloads receive fresh data.
  let requiresDevelopmentRevalidation = false
  if (
    process.env.__NEXT_DEV_SERVER &&
    (entry.expire < MIN_PRERENDERABLE_EXPIRE ||
      (isMemoryCacheDisabled() &&
        !isCustomCacheHandler(cacheContext.handlerKind)))
  ) {
    switch (workUnitStore.type) {
      case 'request':
        requiresDevelopmentRevalidation = true
        break
      case 'cache':
      case 'private-cache':
      case 'prerender':
      case 'prerender-runtime':
      case 'prerender-legacy':
      case 'unstable-cache':
      case 'build-time-generator':
        break
      default:
        workUnitStore satisfies never
    }
  }

  return {
    requiresGeneration:
      expired || (willConsumerServerCache(workUnitStore) && stale),
    requiresRevalidation: stale || requiresDevelopmentRevalidation,
  }
}

function getCacheHandlerMetadata(
  entry: CacheEntry,
  cacheContext: CacheContext
): CacheResultMetadata {
  return {
    tags: entry.tags,
    revalidate: entry.revalidate,
    expire: entry.expire,
    stale: entry.stale,
    timestamp: entry.timestamp,
    readRootParamNames: knownRootParamsByFunctionId.get(
      cacheContext.functionId
    ),
    hasExplicitRevalidate: undefined,
    hasExplicitExpire: undefined,
    dynamicNestedCacheError: undefined,
  }
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
      case 'build-time-generator':
        break
      default:
        workUnitStore satisfies never
    }
  }

  return false
}

function shouldDiscardCacheEntry(
  entry: Pick<CacheEntry, 'tags' | 'timestamp'>,
  workStore: WorkStore,
  workUnitStore: WorkUnitStore,
  implicitTags: string[],
  implicitTagsExpiration: number,
  logPrefix: string
): boolean {
  // If the cache entry was created before any of the implicit tags were
  // revalidated last, we need to discard it.
  if (entry.timestamp <= implicitTagsExpiration) {
    debug?.(
      logPrefix,
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
    case 'build-time-generator':
      break
    default:
      workUnitStore satisfies never
  }

  // If the cache entry contains revalidated tags that the cache handler might
  // not know about yet, we need to discard it.
  if (
    entry.tags.some((tag) =>
      isRevalidatedAfter(tag, entry.timestamp, workStore, logPrefix)
    )
  ) {
    return true
  }

  // Finally, if any of the implicit tags have been revalidated recently, we
  // also need to discard the cache entry.
  if (
    implicitTags.some((tag) =>
      isRevalidatedAfter(tag, entry.timestamp, workStore, logPrefix)
    )
  ) {
    return true
  }

  return false
}

/**
 * Whether `tag` was revalidated after an entry created at `entryTimestamp`,
 * which makes that entry stale. An entry produced after the revalidation
 * already reflects it and is still usable.
 */
function isRevalidatedAfter(
  tag: string,
  entryTimestamp: number,
  workStore: WorkStore,
  logPrefix: string
): boolean {
  const {
    previouslyRevalidatedTags,
    pendingRevalidatedTags,
    requestStartTime,
  } = workStore

  // Was the tag previously revalidated (e.g. by a redirecting server action)?
  // That happened in an earlier request and carries no timestamp of its own, so
  // it counts as having happened when this request started.
  if (
    entryTimestamp <= requestStartTime &&
    previouslyRevalidatedTags.includes(tag)
  ) {
    debug?.(logPrefix, 'tag', tag, 'was previously revalidated')
    return true
  }

  // It could also have been revalidated by the currently running server action.
  // In this case the revalidation might not have been fully propagated by a
  // remote cache handler yet, so we read it from the pending tags in the work
  // store.
  if (
    pendingRevalidatedTags?.some(
      (item) => item.tag === tag && item.revalidatedAt > entryTimestamp
    )
  ) {
    debug?.(logPrefix, 'tag', tag, 'was just revalidated')
    return true
  }

  return false
}

/**
 * A request store in `next start` never delays caches. We only apply delays
 * when the render will be used for validation purposes.
 */
function isValidationRender(requestStore: RequestStore): boolean {
  return !!(
    process.env.__NEXT_CACHE_COMPONENTS &&
    // In dev we're always running validation.
    (process.env.__NEXT_DEV_SERVER ||
      // Build-time instant validation also uses a 'request' store.
      requestStore.validationSamples)
  )
}

function generateCacheEntry(
  workStore: WorkStore,
  cacheContext: CacheContext,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  encodedCacheKeyParts: FormData | string,
  functionToCache: (...functionArguments: unknown[]) => Promise<unknown>,
  timeoutError: UseCacheTimeoutError,
  deadlockError: UseCacheDeadlockError | undefined
) {
  // We need to run this inside a clean AsyncLocalStorage snapshot so that the
  // cache generation cannot read anything from the context we're currently
  // executing which might include request specific things like cookies() inside
  // a React.cache(). Note: It is important that we await at least once before
  // this because it lets us pop out of any stack specific contexts as well -
  // aka "Sync" Local Storage.
  return workStore.runInCleanSnapshot(
    generateCacheEntryWithRestoredWorkStore,
    workStore,
    cacheContext,
    clientReferenceManifest,
    encodedCacheKeyParts,
    functionToCache,
    timeoutError,
    deadlockError
  )
}

function generateCacheEntryWithRestoredWorkStore(
  workStore: WorkStore,
  cacheContext: CacheContext,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  encodedCacheKeyParts: FormData | string,
  functionToCache: (...functionArguments: unknown[]) => Promise<unknown>,
  timeoutError: UseCacheTimeoutError,
  deadlockError: UseCacheDeadlockError | undefined
) {
  // Since we cleared the AsyncLocalStorage we need to restore the workStore.
  // Note: We explicitly don't restore the RequestStore nor the PrerenderStore.
  // We don't want any request specific information leaking an we don't want to
  // create a bloated fake request mock for every cache call. So any feature
  // that currently lives in RequestStore but should be available to Caches need
  // to move to WorkStore. PrerenderStore is not needed inside the cache scope
  // because the outer most one will be the one to report its result to the
  // outer Prerender.
  return workAsyncStorage.run(
    workStore,
    generateCacheEntryWithCacheContext,
    workStore,
    cacheContext,
    clientReferenceManifest,
    encodedCacheKeyParts,
    functionToCache,
    timeoutError,
    deadlockError
  )
}

function generateCacheEntryWithCacheContext(
  workStore: WorkStore,
  cacheContext: CacheContext,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  encodedCacheKeyParts: FormData | string,
  functionToCache: (...functionArguments: unknown[]) => Promise<unknown>,
  timeoutError: UseCacheTimeoutError,
  deadlockError: UseCacheDeadlockError | undefined
) {
  const defaultCacheLife = workStore.cacheLifeProfiles.default
  // Initialize the Store for this Cache entry.
  const cacheStore = createUseCacheStore(
    workStore,
    cacheContext,
    defaultCacheLife
  )

  return workUnitAsyncStorage.run(cacheStore, () =>
    dynamicAccessAsyncStorage.run(
      { abortController: new AbortController(), reason: null },
      generateCacheEntryImpl,
      workStore,
      cacheContext,
      cacheStore,
      clientReferenceManifest,
      encodedCacheKeyParts,
      functionToCache,
      timeoutError,
      deadlockError
    )
  )
}

async function generateCacheEntryImpl(
  workStore: WorkStore,
  cacheContext: CacheContext,
  innerCacheStore: UseCacheStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  encodedCacheKeyParts: FormData | string,
  functionToCache: (...functionArguments: unknown[]) => Promise<unknown>,
  timeoutError: UseCacheTimeoutError,
  deadlockError: UseCacheDeadlockError | undefined
): Promise<GenerateCacheEntryResult> {
  const temporaryReferences = createServerTemporaryReferenceSet()
  const outerWorkUnitStore = cacheContext.outerWorkUnitStore

  const [, functionArguments] =
    typeof encodedCacheKeyParts === 'string'
      ? await decodeReply<CacheKeyParts>(
          encodedCacheKeyParts,
          getServerModuleMap(),
          { temporaryReferences }
        )
      : await decodeReplyFromAsyncIterable<CacheKeyParts>(
          {
            async *[Symbol.asyncIterator]() {
              for (const entry of encodedCacheKeyParts) {
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
                case 'build-time-generator':
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
  const resultPromise = createLazyResult(
    functionToCache.bind(null, ...functionArguments)
  )

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
    case 'cache':
    case 'prerender-runtime':
    case 'prerender': {
      const prerenderStore =
        outerWorkUnitStore.type === 'cache'
          ? outerWorkUnitStore.fallbackRootParamsPrerender
          : outerWorkUnitStore
      if (prerenderStore === null) {
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
      }

      const timeoutAbortController = new AbortController()
      const timer = setTimeout(
        () => {
          workStore.invalidDynamicUsageError = timeoutError
          timeoutAbortController.abort(timeoutError)
        },
        getUseCacheFillTimeoutMs(workStore, prerenderStore.type)
      )

      const dynamicAccessStore = dynamicAccessAsyncStorage.getStore()
      const dynamicAccessAbortSignal =
        dynamicAccessStore?.abortController.signal
      const abortSignal = dynamicAccessAbortSignal
        ? AbortSignal.any([
            dynamicAccessAbortSignal,
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
      const didTimeout = timeoutAbortController.signal.aborted
      if (dynamicAccessAbortSignal) {
        // Release React's listener from the composite signal.
        timeoutAbortController.abort()
      }

      if (didTimeout) {
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
        const reason = dynamicAccessStore?.reason ?? 'runtime'
        const makeHangingPromise =
          reason === 'fallback-params'
            ? makeFallbackParamsHangingPromise
            : makeURLDataHangingPromise
        if (
          innerCacheStore.type === 'cache' &&
          innerCacheStore.fallbackRootParamsPrerender !== null
        ) {
          // No entry is collected for an aborted fill. Still remember the roots
          // actually read so a concrete request won't join this result under
          // the coarse key. Propagate them through aborted parents too.
          addKnownRootParamNames(
            cacheContext.functionId,
            innerCacheStore.readRootParamNames
          )

          const hangingPromise = trackPromiseUsed(
            makeHangingPromise<never>(
              prerenderStore.renderSignal,
              workStore.route,
              'dynamic "use cache"',
              // The single wrapper below tracks access when consumed.
              null
            ),
            () => {
              if (reason === 'fallback-params') {
                trackFallbackParamsAccessed(
                  prerenderStore,
                  'dynamic "use cache"'
                )
              } else {
                trackURLDataAccessed(prerenderStore, 'dynamic "use cache"')
              }

              // The result may also be consumed by a deduped invocation, so
              // record dependencies against the cache consuming it now.
              const consumer = workUnitAsyncStorage.getStore()
              if (consumer !== undefined && consumer.type === 'cache') {
                for (const name of innerCacheStore.readRootParamNames) {
                  consumer.readRootParamNames.add(name)
                }
              }

              // Only a cache consuming this result must suspend. Do not share
              // cancellation with independent sibling cache fills.
              abortOnDynamicAccess(reason, dynamicAccessAbortSignal.reason)
            }
          )

          return {
            type: 'prerender-dynamic',
            reason:
              reason === 'fallback-params' ? FALLBACK_PARAMS : RUNTIME_DATA,
            hangingPromise,
          }
        }

        // If the prerender is aborted because of dynamic access (e.g. reading
        // fallback params), we return a hanging promise. This essentially makes
        // the "use cache" function dynamic.
        const hangingPromise = makeHangingPromise<never>(
          prerenderStore.renderSignal,
          workStore.route,
          'dynamic "use cache"',
          outerWorkUnitStore
        )

        return {
          type: 'prerender-dynamic',
          reason: reason === 'fallback-params' ? FALLBACK_PARAMS : RUNTIME_DATA,
          hangingPromise,
        }
      } else {
        stream = prelude
      }
      break
    }
    case 'request':
      // TODO: We should just check if the render is abandonable. This is
      // relevant in restart-on-cache-miss in general, so when we implement that
      // for cached navs, it'll also be needed in prod
      if (process.env.__NEXT_DEV_SERVER && outerWorkUnitStore.cacheSignal) {
        const stagedRendering = outerWorkUnitStore.stagedRendering
        // Capture the render stage at the start of this cache read, before the
        // yield below. A streamed staged render advances its controller on its
        // own schedule, independently of this read, so by the time the yield
        // resolves the controller may have raced ahead to the Dynamic stage
        // even though the read began in an earlier (prerender) stage.
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
        // captured at read start, not the current one, because the staged
        // render may have advanced past it during the yield above.
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
                  const digest = stringHash(
                    error.message + (error.stack || '')
                  ).toString()
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
            encodedArguments: encodedCacheKeyParts,
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
    case 'private-cache':
    case 'unstable-cache':
    case 'build-time-generator':
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
      consumerWillServerCache: true,
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
      readRootParamNames: new Set<string>(),
      // Every private cache scope is its own work unit. Any cache keyed on
      // headers() or cookies() needs to be invalidated. Otherwise some Next.js
      // API semantics leak across render passes.
      headers: HeadersAdapter.fresh(outerWorkUnitStore.headers),
      cookies: RequestCookiesAdapter.fresh(outerWorkUnitStore.cookies),
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
      case 'build-time-generator':
        break
      default:
        outerWorkUnitStore satisfies never
    }

    let fallbackRootParamsPrerender: PrerenderStoreModernServer | null = null
    if (outerWorkUnitStore.type === 'cache') {
      fallbackRootParamsPrerender =
        outerWorkUnitStore.fallbackRootParamsPrerender
    } else if (outerWorkUnitStore.type === 'prerender') {
      const { fallbackRouteParams } = outerWorkUnitStore
      if (
        fallbackRouteParams !== null &&
        Object.keys(outerWorkUnitStore.rootParams).some((name) =>
          fallbackRouteParams.has(name)
        )
      ) {
        fallbackRootParamsPrerender = outerWorkUnitStore
      }
    }

    return {
      type: 'cache',
      phase: 'render',
      fallbackRootParamsPrerender,
      consumerWillServerCache: true,
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

async function collectResult(
  savedStream: ReadableStream<Uint8Array>,
  workStore: WorkStore,
  cacheContext: CacheContext,
  innerCacheStore: UseCacheStore,
  startTime: number,
  errors: Array<unknown> // This is a live array that gets pushed into.
): Promise<CollectedCacheResult> {
  // We create a buffered stream that collects all chunks until the end to
  // ensure that RSC has finished rendering and therefore we have collected all
  // tags. In the future the RSC API might allow for the equivalent of the
  // allReady Promise that exists on SSR streams.
  //
  // If something errored or rejected anywhere in the render, we close the
  // stream as errored. This lets a CacheHandler choose to save the partial
  // result up until that point for future hits for a while to avoid unnecessary
  // retries or not to retry. We use the end of the stream for this to avoid
  // another complicated side-channel. A receiver has to consider that the
  // stream might also error for other reasons anyway such as losing connection.
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
  // MIN_PRERENDERABLE_EXPIRE`) for private caches, which have no real backing
  // handler. The zero revalidate makes every read serve stale-while-revalidate
  // (regenerating a fresh entry in the background), and
  // `MIN_PRERENDERABLE_EXPIRE` (5 minutes) caps how long an entry lingers in
  // the dedicated in-memory private handler. It is the shortest `expire` that
  // isn't treated as dynamic; a smaller `expire` would exclude the entry from
  // prerenders. Two other cases deliberately do NOT force this and keep their
  // resolved cache life, relying instead on the dev handler's minimum retention
  // and a dev revalidation (see classifyCacheHandlerHit) to keep reloads fast
  // and fresh. The size-0 case (`cacheMaxMemorySize: 0`) keeps its life so the
  // entry can be considered prerenderable instead of being misread as a dynamic
  // hole. An explicit short-`expire` public cache (e.g. `cacheLife({ expire: 0
  // })`) keeps its life so it stays correctly excluded from static prerenders
  // via its real `expire` while a reload still hits the cache; forcing
  // `revalidate: 0` here would instead corrupt the cache life propagated to an
  // enclosing cache and trigger the nested-dynamic error. A cache backed by a
  // custom handler keeps its real cache life too, since that handler owns it.
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
    ? MIN_PRERENDERABLE_EXPIRE
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
    readRootParamNames: innerCacheStore.readRootParamNames,
    // The store accumulates this from nested public caches that propagated a
    // dynamic life into us.
    dynamicNestedCacheError:
      innerCacheStore.type === 'cache'
        ? innerCacheStore.dynamicNestedCacheError
        : undefined,
  }
  return collected
}

function cloneCollectedCacheResult(
  collectedCacheResult: CollectedCacheResult
): CollectedCacheResult {
  const [, entry] = cloneCacheEntry(collectedCacheResult.entry)
  return { ...collectedCacheResult, entry }
}

function saveToCacheHandler(
  cacheHandler: CacheReadWriteHandler,
  functionId: string,
  cacheHandlerKeyBase: string,
  savedCacheResult: Promise<CollectedCacheResult>,
  rootParams: Params | undefined
): Promise<void> {
  // Write the entry to the cache handler. With root params, this is a redirect
  // entry at the coarse key plus the actual entry at the specific key;
  // otherwise just the entry at the coarse key. Both set calls are fired
  // together and awaited in parallel.
  return savedCacheResult.then(async (collectedResult) => {
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
      ? addKnownRootParamNames(functionId, readRootParamNames)
      : knownRootParamsByFunctionId.get(functionId)

    const setPromises: Promise<void>[] = []
    let coarseEntry: CacheEntry = fullEntry
    if (rootParamNames && rootParamNames.size > 0 && rootParams) {
      const specificKey =
        cacheHandlerKeyBase +
        computeRootParamsCacheKeySuffix(rootParams, rootParamNames)
      setPromises.push(
        // Capture synchronous `set()` throws as rejected write promises.
        new Promise<void>((resolve) => {
          resolve(cacheHandler.set(specificKey, Promise.resolve(fullEntry)))
        })
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
      // Capture synchronous `set()` throws as rejected write promises.
      new Promise<void>((resolve) => {
        resolve(
          cacheHandler.set(cacheHandlerKeyBase, Promise.resolve(coarseEntry))
        )
      })
    )

    // A failed write must not finish the operation while another write is
    // pending.
    for (const result of await Promise.allSettled(setPromises)) {
      if (result.status === 'rejected') {
        throw result.reason
      }
    }
  })
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
 * Nested caches propagate root param names into the enclosing cache's
 * `readRootParamNames` set. This propagation is never deferred. Prerender
 * contexts also register known root param names when they read the resume data
 * cache. A response accumulator records the consumed entry's root vary params
 * to prevent segment reuse across different values.
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
        isValidationRender(outerWorkUnitStore) &&
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
    case 'build-time-generator':
      break
    default: {
      outerWorkUnitStore satisfies never
    }
  }
}

function propagateCacheEntryMetadata(
  cacheContext: CacheContext,
  metadata: CacheResultMetadata
): void {
  if (cacheContext.kind === 'private') {
    switch (cacheContext.outerWorkUnitStore.type) {
      case 'private-cache':
        if (metadata.readRootParamNames) {
          for (const paramName of metadata.readRootParamNames) {
            cacheContext.outerWorkUnitStore.readRootParamNames.add(paramName)
          }
        }
      // fallthrough
      case 'prerender-runtime':
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
        // If this entry's cache life is dynamic, record this invocation as the
        // origin to use as `cause` when the outer cache surfaces the
        // nested-dynamic cache error. `??=` keeps the first occurrence so the
        // cause points at the immediate dynamic child.
        if (
          cacheContext.dynamicNestedCacheError !== undefined &&
          (metadata.revalidate === 0 ||
            metadata.expire < MIN_PRERENDERABLE_EXPIRE)
        ) {
          cacheContext.outerWorkUnitStore.dynamicNestedCacheError ??=
            cacheContext.dynamicNestedCacheError
        }
      // fallthrough
      case 'private-cache':
        if (metadata.readRootParamNames) {
          for (const paramName of metadata.readRootParamNames) {
            cacheContext.outerWorkUnitStore.readRootParamNames.add(paramName)
          }
        }
      // fallthrough
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
      case 'build-time-generator':
        break
      default:
        cacheContext.outerWorkUnitStore satisfies never
    }
  }

  if (metadata.readRootParamNames) {
    const varyParamsAccumulator = getVaryParamsAccumulator(
      cacheContext.outerWorkUnitStore
    )
    if (varyParamsAccumulator) {
      for (const paramName of metadata.readRootParamNames) {
        accumulateVaryParam(varyParamsAccumulator.rootParams, paramName)
      }
    }
  }
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

function createTrackedReadableStream(
  stream: ReadableStream,
  cacheSignal: CacheSignal
) {
  const reader = stream.getReader()
  // End the read exactly once, whether the stream finishes, errors, or is
  // canceled: a read that never ends keeps `cacheReady()` from resolving, and a
  // second `endRead()` would unbalance the signal.
  let readEnded = false
  const endRead = () => {
    if (!readEnded) {
      readEnded = true
      cacheSignal.endRead()
    }
  }
  return new ReadableStream({
    async pull(controller) {
      try {
        const { done, value } = await reader.read()
        if (done) {
          controller.close()
          endRead()
        } else {
          controller.enqueue(value)
        }
      } catch (error) {
        endRead()
        throw error
      }
    },
    cancel(reason) {
      endRead()
      return reader.cancel(reason)
    },
  })
}

function ignoreReject() {}
