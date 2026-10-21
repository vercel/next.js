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
  const cacheCallContext = initializeCacheCall(handlerKind, functionId)
  if (cacheCallContext.type === 'prerender-dynamic') {
    return cacheCallContext.hangingPromise
  }

  const pendingCacheRenderStage = waitForCacheRenderStage(
    cacheCallContext.cacheConsumerContext
  )
  if (pendingCacheRenderStage !== undefined) {
    await pendingCacheRenderStage
  }

  const encodedCacheInvocation = await encodeCacheInvocation(
    cacheCallContext,
    originalFunction,
    functionArguments,
    boundArgumentsLength
  )
  if (encodedCacheInvocation.type === 'prerender-dynamic') {
    return encodedCacheInvocation.hangingPromise
  }

  if (
    process.env.__NEXT_DEV_SERVER &&
    cacheCallContext.workStore.useCacheProbeMode
  ) {
    return runCacheProbe(
      cacheCallContext,
      encodedCacheInvocation,
      cacheCallContext.workStore.useCacheProbeMode.timeoutMs
    )
  }

  const cacheReadContext = await createCacheReadContext(
    cacheCallContext,
    encodedCacheInvocation
  )

  const resumeDataCacheReadResult =
    cacheReadContext.resumeDataCache === null
      ? undefined
      : await readFromResumeDataCache(cacheReadContext)

  const cacheResult: CacheResult =
    resumeDataCacheReadResult ??
    (await readOrFillCache(cacheReadContext, encodedCacheInvocation))
  if (cacheResult.type === 'prerender-dynamic') {
    return cacheResult.hangingPromise
  }

  return decodeCacheStream(
    cacheResult.stream,
    encodedCacheInvocation.temporaryReferences
  )
}

interface PrivateCacheConsumerContext {
  readonly kind: 'private'
  readonly outerWorkUnitStore:
    | RequestStore
    | PrivateUseCacheStore
    | PrerenderStoreModernRuntime
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
}

interface PublicCacheConsumerContext {
  readonly kind: 'public'
  // TODO: We should probably forbid nesting "use cache" inside unstable_cache.
  readonly outerWorkUnitStore: Exclude<
    WorkUnitStore,
    PrerenderStoreModernClient | ValidationStoreClient
  >
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

type CacheConsumerContext =
  | PrivateCacheConsumerContext
  | PublicCacheConsumerContext

interface CacheCallContext {
  readonly type: 'ready'
  readonly workStore: WorkStore
  readonly cacheConsumerContext: CacheConsumerContext
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

interface CacheReadContext {
  readonly cacheCallContext: CacheCallContext
  readonly cacheInvocationKeys: CacheInvocationKeys
  readonly resumeDataCache: ResumeDataCache | null
  readonly resumeDataCacheValue: ResumeDataCacheValue
  readonly implicitTags: string[]
}

interface CacheStreamResult {
  readonly type: 'stream'
  readonly stream: ReadableStream<Uint8Array>
}

type CacheResult = CacheStreamResult | CacheReadDynamic

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
 * Retains generated bytes for local consumers and pending cross-WorkStore
 * consumers. Forks streams lazily and separates collected metadata from
 * write-aware completion.
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

interface SharedCacheHandlerHit {
  readonly type: 'handler-hit'
  readonly entry: CacheEntry
  readonly cacheHandlerKey: string
}

interface SharedCacheFillEntry {
  readonly type: 'generated'
  readonly entry: SharedCacheEntry
}

interface SharedCacheFillDynamic {
  readonly type: 'prerender-dynamic'
  readonly reason: typeof FALLBACK_PARAMS | typeof RUNTIME_DATA
  readonly hangingPromise: Promise<never>
}

type SharedCacheFillResult = SharedCacheFillEntry | SharedCacheFillDynamic

interface CacheLookupRetry {
  readonly type: 'retry-lookup'
}

type CacheFillAttemptResult = SharedCacheFillResult | CacheLookupRetry

interface SharedCacheLookupMiss {
  readonly type: 'miss'
  readonly cacheHandlerKey: string
}

type SharedCacheLookupResult = SharedCacheHandlerHit | SharedCacheLookupMiss

interface CacheInvocationKeys {
  readonly cacheHandlerKey: string
  readonly cacheHandlerKeyBase: string
  readonly serializedCacheKey: string
}

/**
 * A dynamic fill settles without warming a handler entry. Generated completion
 * includes all handler writes, so only that outcome can suppress later warming.
 */
type CacheFillCompletion = 'generated' | 'prerender-dynamic'

/**
 * Runs one generation and its handler writes. WorkStores can share this
 * operation while it remains pending.
 */
interface CacheFillOperation {
  readonly cacheInvocationKeys: CacheInvocationKeys
  /**
   * Resolves when generation exposes a stream or a dynamic result.
   */
  readonly result: Promise<SharedCacheFillResult>
  /**
   * Settles after collection and handler writes. Rejects if either fails.
   */
  readonly completion: Promise<CacheFillCompletion>
}

/**
 * Records a fill that was pending when a handler lookup began. The observation
 * retains only its keys and completion, so it cannot supply generated data.
 */
interface ObservedCacheFill {
  readonly cacheInvocationKeys: CacheInvocationKeys
  readonly completion: Promise<CacheFillCompletion>
}

interface CacheHandlerLookup {
  readonly cacheInvocationKeys: CacheInvocationKeys
  readonly result: Promise<SharedCacheLookupResult>
  // Each get captures its fill before yielding, including a redirected get.
  readonly observedCacheFills: readonly ObservedCacheFill[]
}

type CacheReadOperation =
  | {
      readonly type: 'lookup'
      readonly cacheHandlerLookup: CacheHandlerLookup
    }
  | {
      readonly type: 'fill'
      readonly cacheFillAttempt: CacheFillAttempt
    }
  | {
      readonly type: 'completed'
      readonly result: SharedCacheFillEntry
      readonly completion: Promise<void>
    }
  | {
      readonly type: 'forced-miss'
      readonly cacheInvocationKeys: CacheInvocationKeys
    }

/**
 * Coordinates one WorkStore's attempt to obtain generated data. The attempt can
 * start or join a fill operation, or request another lookup after a root-key
 * correction.
 */
interface CacheFillAttempt {
  /**
   * Resolves with the generated result or a lookup retry.
   */
  readonly result: Promise<CacheFillAttemptResult>
  /**
   * Settles after the fill operation and the WorkStore state update.
   */
  readonly completion: Promise<void>
}

interface PendingWorkStoreCacheFill {
  readonly type: 'pending'
  readonly cacheFillAttempt: CacheFillAttempt
}

interface CompletedWorkStoreCacheFill {
  readonly type: 'completed'
  readonly cacheFillAttempt: CacheFillAttempt
  readonly result: SharedCacheFillEntry
  readonly metadata: CacheResultMetadata
}

type WorkStoreCacheFill =
  | PendingWorkStoreCacheFill
  | CompletedWorkStoreCacheFill

export interface WorkStoreCacheEntryState {
  cacheInvocationKeys: CacheInvocationKeys
  cacheHandlerLookup: CacheHandlerLookup | undefined
  workStoreCacheFill: WorkStoreCacheFill | undefined
}

type ResumeDataCacheValue = ReturnType<ResumeDataCache['cache']['get']>

interface CacheFillAttemptRequest {
  readonly cacheInvocationKeys: CacheInvocationKeys
  readonly cacheHandlerLookup: CacheHandlerLookup | undefined
}

interface CacheConsumerFillRequest extends CacheFillAttemptRequest {
  readonly validatedCacheHandlerHit: SharedCacheHandlerHit | undefined
}

interface CacheReadStream extends CacheStreamResult {
  readonly backgroundRevalidationRequest: CacheConsumerFillRequest | undefined
}

interface CacheReadFill {
  readonly type: 'fill'
  readonly cacheConsumerFillRequest: CacheConsumerFillRequest
}

interface CacheReadDynamic {
  readonly type: 'prerender-dynamic'
  readonly hangingPromise: Promise<never>
}

type CacheReadDecision =
  | CacheReadStream
  | CacheReadFill
  | CacheReadDynamic
  | CacheLookupRetry

interface CacheGenerationInputs {
  readonly clientReferenceManifest: DeepReadonly<ClientReferenceManifest>
  readonly encodedCacheKeyParts: FormData | string
  readonly functionToCache: (
    ...functionArguments: unknown[]
  ) => Promise<unknown>
  readonly timeoutError: UseCacheTimeoutError
  readonly deadlockError: UseCacheDeadlockError | undefined
}

interface CacheFillExecutionResult {
  readonly result: CacheFillAttemptResult
  readonly cacheInvocationKeys: CacheInvocationKeys
  readonly completion: Promise<CacheFillCompletion | void>
}

// Only generation is shared across WorkStores. A handler answer belongs to the
// WorkStore that read and validated it.
const crossWorkStoreCacheFills = new Map<string, CacheFillOperation>()

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

type BackgroundCacheRevalidationOperation =
  | CacheReadOperation
  | {
      readonly type: 'observed-completion'
      readonly cacheConsumerFillRequest: CacheConsumerFillRequest
      readonly observedCacheFill: ObservedCacheFill
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

type GenerateCacheEntryResult =
  | {
      readonly type: 'cached'
      readonly stream: ReadableStream
      readonly pendingCacheResult: Promise<CollectedCacheResult>
    }
  | {
      readonly type: 'prerender-dynamic'
      readonly reason: typeof FALLBACK_PARAMS | typeof RUNTIME_DATA
      readonly hangingPromise: Promise<never>
    }

function initializeCacheCall(
  handlerKind: string,
  functionId: string
): CacheCallContext | CacheReadDynamic {
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
  //   await setTimeout(100)  // we can't abort this uncached IO...
  //   await cachedData()     // ...so we'll still get here even though the prerender aborted
  //
  // The prerender is over, so we should just return an erroring promise.
  // (NOTE: we also shouldn't fill this cache, because it's behind uncached IO,
  // so semantically it is not part of the prerender)
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

  let cacheConsumerContext: CacheConsumerContext
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
        cacheConsumerContext = {
          kind: 'private',
          outerWorkUnitStore: workUnitStore,
          outerOwnerStack,
          functionId,
          handlerKind,
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
        // will assume that cacheConsumerContext is used before being assigned.
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

        cacheConsumerContext = {
          kind: 'public',
          outerWorkUnitStore: workUnitStore,
          outerOwnerStack,
          functionId,
          handlerKind,
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
      // unstable_cache.
      // (fallthrough)
      case 'build-time-generator':
        cacheConsumerContext = {
          kind: 'public',
          outerWorkUnitStore: workUnitStore,
          outerOwnerStack,
          functionId,
          handlerKind,
          dynamicNestedCacheError: undefined,
        }
        break
      default:
        workUnitStore satisfies never
        // This is dead code, but without throwing an error here, TypeScript
        // will assume that cacheConsumerContext is used before being assigned.
        throw new InvariantError(`Unexpected work unit store.`)
    }
  }

  // Get the clientReferenceManifest while we're still in the outer Context. In
  // case getClientReferenceManifestSingleton is implemented using
  // AsyncLocalStorage.
  const clientReferenceManifest = getClientReferenceManifest()
  const hangingInputAbortSignal = createHangingInputAbortSignal(workUnitStore)

  return {
    type: 'ready',
    workStore,
    cacheConsumerContext,
    cacheHandler,
    clientReferenceManifest,
    hangingInputAbortSignal,
    timeoutError,
    deadlockError,
    logPrefix,
  }
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
  cacheConsumerContext: CacheConsumerContext
): Promise<void> | undefined {
  if (cacheConsumerContext.kind === 'private') {
    const { outerWorkUnitStore } = cacheConsumerContext
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
  cacheCallContext: CacheCallContext,
  originalFunction: (...functionArguments: unknown[]) => Promise<unknown>,
  functionArguments: unknown[],
  boundArgumentsLength: number
): Promise<EncodedCacheInvocation | CacheReadDynamic> {
  const { workStore, cacheConsumerContext, hangingInputAbortSignal } =
    cacheCallContext
  const workUnitStore = cacheConsumerContext.outerWorkUnitStore
  const functionId = cacheConsumerContext.functionId

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

    if (cacheConsumerContext.kind === 'private') {
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
  cacheCallContext: CacheCallContext,
  encodedCacheInvocation: EncodedCacheInvocation,
  probeTimeoutMs: number
): Promise<void> {
  const {
    workStore,
    cacheConsumerContext,
    clientReferenceManifest,
    timeoutError,
  } = cacheCallContext
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
    cacheConsumerContext,
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

async function createCacheReadContext(
  cacheCallContext: CacheCallContext,
  encodedCacheInvocation: EncodedCacheInvocation
): Promise<CacheReadContext> {
  const { cacheConsumerContext } = cacheCallContext
  const workUnitStore = cacheConsumerContext.outerWorkUnitStore
  const functionId = cacheConsumerContext.functionId
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
    (process.env.__NEXT_DEV_SERVER && cacheConsumerContext.kind === 'private'
      ? computePrivateCacheKeyRequestSuffix(
          cacheConsumerContext.outerWorkUnitStore.cookies,
          cacheConsumerContext.outerWorkUnitStore.headers
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

  const resumeDataCache = getResumeDataCache(workUnitStore)
  const implicitTags = workUnitStore.implicitTags?.tags ?? []

  return {
    cacheCallContext,
    cacheInvocationKeys: {
      cacheHandlerKey,
      cacheHandlerKeyBase,
      serializedCacheKey,
    },
    resumeDataCache,
    // The RDC read and any replacement must use the same observed value.
    resumeDataCacheValue: resumeDataCache?.cache.get(serializedCacheKey),
    implicitTags,
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
  cacheReadContext: CacheReadContext
): Promise<CacheResult | undefined> {
  const { resumeDataCache, resumeDataCacheValue } = cacheReadContext
  if (resumeDataCache === null) {
    return undefined
  }

  const { cacheConsumerContext, workStore } = cacheReadContext.cacheCallContext
  const workUnitStore = cacheConsumerContext.outerWorkUnitStore

  switch (resumeDataCacheValue) {
    case FALLBACK_PARAMS:
    case RUNTIME_DATA:
    case SESSION_DATA: {
      switch (workUnitStore.type) {
        case 'prerender':
        case 'prerender-runtime': {
          const makeHangingPromise =
            resumeDataCacheValue === FALLBACK_PARAMS
              ? makeFallbackParamsHangingPromise
              : resumeDataCacheValue === SESSION_DATA
                ? makeSessionDataHangingPromise
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

      return handleMissingResumeDataCacheEntry(cacheReadContext)
    }
    case undefined:
      return handleMissingResumeDataCacheEntry(cacheReadContext)
    default: {
      const collectedCacheResult = await readResumeDataCacheEntry(
        cacheReadContext,
        resumeDataCacheValue
      )
      if (collectedCacheResult === undefined) {
        return undefined
      }

      return consumeResumeDataCacheEntry(cacheReadContext, collectedCacheResult)
    }
  }
}

function handleMissingResumeDataCacheEntry(
  cacheReadContext: CacheReadContext
): CacheReadDynamic | undefined {
  const { resumeDataCache, cacheInvocationKeys } = cacheReadContext
  const { workStore, cacheConsumerContext, logPrefix } =
    cacheReadContext.cacheCallContext
  const { serializedCacheKey } = cacheInvocationKeys
  const workUnitStore = cacheConsumerContext.outerWorkUnitStore

  const cacheSignal = getCacheSignal(workUnitStore)
  debug?.(
    logPrefix,
    'Resume Data Cache entry not found',
    serializedCacheKey,
    `(${resumeDataCache?.cache.size} entries)`
  )
  switch (workUnitStore.type) {
    case 'prerender':
      if (resumeDataCache?.mutable === false) {
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
  cacheReadContext: CacheReadContext,
  pendingCollectedCacheResult: Promise<CollectedCacheResult>
): Promise<CollectedCacheResult | undefined> {
  const { cacheInvocationKeys, implicitTags } = cacheReadContext
  const { workStore, cacheConsumerContext, logPrefix } =
    cacheReadContext.cacheCallContext
  const { serializedCacheKey } = cacheInvocationKeys

  const cacheSignal = getCacheSignal(cacheConsumerContext.outerWorkUnitStore)
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
  cacheReadContext: CacheReadContext,
  collectedCacheResult: CollectedCacheResult
): Promise<CacheResult> {
  const { cacheInvocationKeys } = cacheReadContext
  const { cacheConsumerContext, logPrefix } = cacheReadContext.cacheCallContext
  const { serializedCacheKey } = cacheInvocationKeys
  const workUnitStore = cacheConsumerContext.outerWorkUnitStore
  const cacheSignal = getCacheSignal(workUnitStore)
  const { entry } = collectedCacheResult

  let isUntrackedValidationDeferral = false
  switch (workUnitStore.type) {
    case 'request':
      isUntrackedValidationDeferral =
        isValidationRender(workUnitStore) &&
        (entry.revalidate === 0 ||
          entry.expire < MIN_PRERENDERABLE_EXPIRE ||
          entry.stale < MIN_SHELL_STALE)
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

  let cacheSignalReadActive = !isUntrackedValidationDeferral
  if (cacheSignalReadActive) {
    cacheSignal?.beginRead()
  }
  try {
    const cacheReadDynamic = await applyResumeDataCacheRenderPolicy(
      cacheReadContext,
      collectedCacheResult
    )
    if (cacheReadDynamic !== null) {
      return cacheReadDynamic
    }

    debug?.(logPrefix, 'Resume Data Cache entry found', serializedCacheKey)

    if (
      collectedCacheResult.readRootParamNames &&
      collectedCacheResult.readRootParamNames.size > 0
    ) {
      addKnownRootParamNames(
        cacheConsumerContext.functionId,
        collectedCacheResult.readRootParamNames
      )
    }

    // We want to make sure we only propagate cache life & tags if the entry was
    // *not* omitted from the prerender. So we only do this after the above
    // early returns.
    propagateCacheEntryMetadata(cacheConsumerContext, {
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

async function applyResumeDataCacheRenderPolicy(
  cacheReadContext: CacheReadContext,
  collectedCacheResult: CollectedCacheResult
): Promise<CacheReadDynamic | null> {
  const { cacheInvocationKeys } = cacheReadContext
  const { workStore, cacheConsumerContext, logPrefix } =
    cacheReadContext.cacheCallContext
  const { serializedCacheKey } = cacheInvocationKeys
  const workUnitStore = cacheConsumerContext.outerWorkUnitStore

  if (
    collectedCacheResult.entry.revalidate === 0 ||
    collectedCacheResult.entry.expire < MIN_PRERENDERABLE_EXPIRE
  ) {
    // The nested-cache error only makes sense when a dynamic nested cache
    // actually shortened an outer cache that has no explicit `cacheLife`
    // (`dynamicNestedCacheError` is set), and only when the app's default
    // profile is itself prerenderable. If the default profile is already
    // dynamic (`revalidate: 0` or an `expire` under the prerenderable minimum),
    // every cache is omitted from prerenders by default, so there is no silent
    // degradation to warn about. A short life from the default profile, or from
    // a dev private cache's self-imposed `revalidate: 0` (which never carries a
    // nested error), therefore stays a dynamic hole rather than erroring.
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

        // The entry is only excluded from *static* prerenders — the
        // 'prerender-runtime' case below serves it.
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
        // In the final phase of a runtime prerender, we have to make sure that
        // APIs that would hang during a static prerender are resolved with a
        // delay, in the appropriate runtime stage.
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
    // The entry's stale time is short enough that it's excluded from shells. If
    // it's below `MIN_PREFETCHABLE_STALE`, it's not worth prefetching at all
    // and is excluded from prerenders entirely, leaving a dynamic hole that can
    // be filled during the navigation. Otherwise, it's still included in
    // prerenders and cached navigations, but it must not be part of an App
    // Shell, which may be reused on the client for longer than the entry's
    // stale time. We delay the entry to resolve in the post-shell (link data)
    // stage, which excludes both its content and its stale time from the shell.
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
            // Final prerender (with staging). This entry cannot be part of the
            // shell, so we delay it to the prefetch.
            let prefetchStage: AdvanceableRenderStage
            if (prerenderStore.type === 'prerender') {
              prefetchStage = RENDER_STAGES_BY_DATA_KIND.staticUrlData.static
            } else {
              prefetchStage = RENDER_STAGES_BY_DATA_KIND.runtimeUrlData
            }

            if (
              // If the prerender ends before the prefetch stage (because render
              // that only produces an App Shell), this cache should be omitted
              // entirely.
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
            // If the entry would be be excluded from the shell, treat it as if
            // it were static URL data. (Note that this is still correct without
            // PPF or in static shell validation, where we don't use runtime
            // shells and include static URL data)
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

  return null
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
  resumeDataCache: ResumeDataCache | null,
  logPrefix: string,
  expectedResumeDataCacheValue: ResumeDataCacheValue
): void {
  if (
    !resumeDataCache?.mutable ||
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
  cacheReadContext: CacheReadContext,
  encodedCacheInvocation: EncodedCacheInvocation
): Promise<CacheResult> {
  const {
    workStore,
    cacheConsumerContext,
    clientReferenceManifest,
    timeoutError,
    deadlockError,
  } = cacheReadContext.cacheCallContext

  const workStoreCacheEntryState = getOrCreateWorkStoreCacheEntryState(
    workStore,
    cacheReadContext.cacheInvocationKeys
  )

  const cacheGenerationInputs: CacheGenerationInputs = {
    clientReferenceManifest,
    encodedCacheKeyParts: encodedCacheInvocation.encodedCacheKeyParts,
    functionToCache: encodedCacheInvocation.functionToCache,
    timeoutError,
    deadlockError,
  }

  let cacheReadOperation = selectCacheReadOperation(
    workStoreCacheEntryState,
    cacheReadContext
  )
  try {
    while (true) {
      const cacheReadDecision = await readCacheResultForConsumer(
        cacheReadOperation,
        cacheReadContext
      )
      switch (cacheReadDecision.type) {
        case 'retry-lookup':
          cacheReadOperation = selectCacheReadOperation(
            workStoreCacheEntryState,
            cacheReadContext
          )
          break
        case 'fill':
          cacheReadOperation = selectCacheFillForConsumer(
            workStoreCacheEntryState,
            cacheReadDecision.cacheConsumerFillRequest,
            cacheReadContext,
            cacheGenerationInputs
          )
          break
        case 'prerender-dynamic':
          return cacheReadDecision
        case 'stream':
          if (cacheReadDecision.backgroundRevalidationRequest !== undefined) {
            startBackgroundCacheRevalidation(
              workStoreCacheEntryState,
              cacheReadDecision.backgroundRevalidationRequest,
              cacheReadContext,
              cacheGenerationInputs
            )
          }

          return { type: 'stream', stream: cacheReadDecision.stream }
        default:
          cacheReadDecision satisfies never
      }
    }
  } finally {
    releaseCacheHandlerLookup(
      workStoreCacheEntryState,
      cacheReadOperation.type === 'lookup'
        ? cacheReadOperation.cacheHandlerLookup
        : undefined,
      cacheConsumerContext
    )
  }
}

function getOrCreateWorkStoreCacheEntryState(
  workStore: WorkStore,
  cacheInvocationKeys: CacheInvocationKeys
): WorkStoreCacheEntryState {
  const workStoreCacheEntryStates = (workStore.cacheEntryStates ??= new Map<
    string,
    WorkStoreCacheEntryState
  >())
  let workStoreCacheEntryState = workStoreCacheEntryStates.get(
    cacheInvocationKeys.serializedCacheKey
  )
  if (workStoreCacheEntryState === undefined) {
    workStoreCacheEntryState = {
      cacheInvocationKeys,
      cacheHandlerLookup: undefined,
      workStoreCacheFill: undefined,
    }
    workStoreCacheEntryStates.set(
      cacheInvocationKeys.serializedCacheKey,
      workStoreCacheEntryState
    )
  }

  return workStoreCacheEntryState
}

/**
 * Selects completed local data or reserves a caller-local lookup. A pending
 * fill does not hide a handler entry that a direct consumer can serve during
 * revalidation.
 */
function selectCacheReadOperation(
  workStoreCacheEntryState: WorkStoreCacheEntryState,
  cacheReadContext: CacheReadContext
): CacheReadOperation {
  const { workStore, cacheConsumerContext, cacheHandler, logPrefix } =
    cacheReadContext.cacheCallContext
  const { implicitTags } = cacheReadContext

  const reusableWorkStoreCacheFill = getReusableWorkStoreCacheFill(
    workStoreCacheEntryState,
    workStore,
    cacheConsumerContext,
    implicitTags,
    logPrefix
  )
  if (reusableWorkStoreCacheFill?.type === 'completed') {
    debug?.(logPrefix, 'selecting completed local fill')
    return {
      type: 'completed',
      result: reusableWorkStoreCacheFill.result,
      completion: reusableWorkStoreCacheFill.cacheFillAttempt.completion,
    }
  }

  if (
    shouldForceRevalidate(workStore, cacheConsumerContext.outerWorkUnitStore)
  ) {
    debug?.(logPrefix, 'bypassing handler lookup for forced revalidation')
    return {
      type: 'forced-miss',
      cacheInvocationKeys: workStoreCacheEntryState.cacheInvocationKeys,
    }
  }

  const cacheHandlerLookup =
    workStoreCacheEntryState.cacheHandlerLookup ??
    startCacheHandlerLookup(
      workStoreCacheEntryState,
      workStoreCacheEntryState.cacheInvocationKeys,
      workStore,
      cacheConsumerContext,
      cacheHandler,
      implicitTags,
      logPrefix
    )
  return { type: 'lookup', cacheHandlerLookup }
}

async function readCacheResultForConsumer(
  cacheReadOperation: CacheReadOperation,
  cacheReadContext: CacheReadContext
): Promise<CacheReadDecision> {
  const {
    resumeDataCache,
    resumeDataCacheValue,
    implicitTags,
    cacheInvocationKeys,
  } = cacheReadContext
  const { workStore, cacheConsumerContext, logPrefix } =
    cacheReadContext.cacheCallContext
  const { serializedCacheKey } = cacheInvocationKeys
  const workUnitStore = cacheConsumerContext.outerWorkUnitStore

  const cacheSignal = getCacheSignal(workUnitStore)
  cacheSignal?.beginRead()
  let cacheSignalReadActive = true

  let stream: ReadableStream<Uint8Array> | undefined
  try {
    if (
      cacheReadOperation.type === 'fill' ||
      cacheReadOperation.type === 'completed'
    ) {
      const cacheFillAttemptResult =
        cacheReadOperation.type === 'fill'
          ? await cacheReadOperation.cacheFillAttempt.result
          : cacheReadOperation.result
      if (cacheFillAttemptResult.type === 'retry-lookup') {
        return { type: 'retry-lookup' }
      }

      if (cacheFillAttemptResult.type === 'prerender-dynamic') {
        if (resumeDataCache?.mutable) {
          resumeDataCache.cache.set(
            serializedCacheKey,
            cacheFillAttemptResult.reason
          )
        }
        return {
          type: 'prerender-dynamic',
          hangingPromise: cacheFillAttemptResult.hangingPromise,
        }
      }

      stream = serveGeneratedCacheEntry(
        cacheFillAttemptResult.entry,
        serializedCacheKey,
        workStore.isDraftMode ? null : resumeDataCache,
        cacheConsumerContext,
        cacheSignal,
        logPrefix,
        resumeDataCacheValue
      )
      cacheSignalReadActive = false
      return {
        type: 'stream',
        stream,
        backgroundRevalidationRequest: undefined,
      }
    }

    if (cacheReadOperation.type === 'forced-miss') {
      return {
        type: 'fill',
        cacheConsumerFillRequest: {
          cacheInvocationKeys: cacheReadOperation.cacheInvocationKeys,
          cacheHandlerLookup: undefined,
          validatedCacheHandlerHit: undefined,
        },
      }
    }

    const cacheHandlerLookup = cacheReadOperation.cacheHandlerLookup
    const cacheHandlerLookupResult = await cacheHandlerLookup.result
    const cacheLookupKeys = {
      ...cacheHandlerLookup.cacheInvocationKeys,
      cacheHandlerKey: cacheHandlerLookupResult.cacheHandlerKey,
    }
    const cacheConsumerFillRequest: CacheConsumerFillRequest = {
      cacheInvocationKeys: cacheLookupKeys,
      cacheHandlerLookup,
      validatedCacheHandlerHit:
        cacheHandlerLookupResult.type === 'handler-hit'
          ? cacheHandlerLookupResult
          : undefined,
    }
    if (cacheHandlerLookupResult.type === 'miss') {
      return { type: 'fill', cacheConsumerFillRequest }
    }

    if (
      !(await isValidCacheHandlerHit(
        cacheHandlerLookupResult,
        workStore,
        cacheConsumerContext,
        implicitTags,
        logPrefix
      ))
    ) {
      return {
        type: 'fill',
        cacheConsumerFillRequest: {
          ...cacheConsumerFillRequest,
          validatedCacheHandlerHit: undefined,
        },
      }
    }

    const cacheHandlerHitClassification = classifyCacheHandlerHit(
      cacheHandlerLookupResult.entry,
      cacheConsumerContext
    )
    const entry = cacheHandlerLookupResult.entry

    // Short-lived entries are dynamic holes in a prerendered shell. A request
    // can still serve them after advancing to the required validation stage.
    if (entry.revalidate === 0 || entry.expire < MIN_PRERENDERABLE_EXPIRE) {
      switch (workUnitStore.type) {
        case 'prerender': {
          cacheSignal?.endRead()
          cacheSignalReadActive = false

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
        }
        case 'request':
          if (isValidationRender(workUnitStore)) {
            // This stage wait is intentionally untracked. A later fill starts a
            // new read, so it cannot make cache readiness wait for
            // presentation.
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

    if (cacheHandlerHitClassification.requiresGeneration) {
      return { type: 'fill', cacheConsumerFillRequest }
    }

    const [, consumerCacheEntry] = cloneCacheEntry(entry)
    stream = consumerCacheEntry.value

    const metadata = getCacheHandlerMetadata(
      cacheHandlerLookupResult,
      cacheConsumerContext
    )
    maybePropagateCacheEntryMetadata(cacheConsumerContext, metadata)

    if (resumeDataCache?.mutable) {
      if (
        canWriteResumeDataCacheEntry(
          resumeDataCache,
          serializedCacheKey,
          resumeDataCacheValue
        )
      ) {
        const [servingEntry, savedEntry] = cloneCacheEntry(consumerCacheEntry)
        stream = servingEntry.value
        const savedCacheResult = Promise.resolve({
          entry: savedEntry,
          hasExplicitRevalidate: metadata.hasExplicitRevalidate,
          hasExplicitExpire: metadata.hasExplicitExpire,
          readRootParamNames: metadata.readRootParamNames,
          dynamicNestedCacheError: metadata.dynamicNestedCacheError,
        })
        resumeDataCache.cache.set(serializedCacheKey, savedCacheResult)
      }

      if (cacheSignalReadActive) {
        if (cacheSignal) {
          stream = createTrackedReadableStream(stream, cacheSignal)
        }
        cacheSignalReadActive = false
      }
    }

    return {
      type: 'stream',
      stream,
      backgroundRevalidationRequest:
        cacheHandlerHitClassification.requiresRevalidation
          ? {
              cacheInvocationKeys: cacheLookupKeys,
              cacheHandlerLookup,
              validatedCacheHandlerHit: cacheHandlerLookupResult,
            }
          : undefined,
    }
  } catch (error) {
    stream?.cancel().catch(ignoreReject)
    throw error
  } finally {
    if (cacheSignalReadActive) {
      cacheSignal?.endRead()
    }
  }
}

/**
 * Forks generated data for one consumer and owns its metadata/RDC effects.
 * Collection settlement ends this read, even if propagation fails. Handler
 * persistence does not delay the returned stream or the consumer's read
 * completion.
 */
function serveGeneratedCacheEntry(
  sharedCacheEntry: SharedCacheEntry,
  serializedCacheKey: string,
  resumeDataCache: ResumeDataCache | null,
  cacheConsumerContext: CacheConsumerContext,
  cacheSignal: CacheSignal | null,
  logPrefix: string,
  expectedResumeDataCacheValue: ResumeDataCacheValue
): ReadableStream<Uint8Array> {
  const stream = sharedCacheEntry.fork()
  saveSharedCacheEntryToResumeDataCache(
    serializedCacheKey,
    sharedCacheEntry,
    resumeDataCache,
    logPrefix,
    expectedResumeDataCacheValue
  )

  sharedCacheEntry.pendingMetadata
    .then((metadata) => {
      maybePropagateCacheEntryMetadata(cacheConsumerContext, metadata)
    })
    .finally(() => {
      cacheSignal?.endRead()
    })
    .catch(ignoreReject)

  return stream
}

/**
 * Acquires local generation before rejecting an obsolete lookup. A nested
 * consumer can therefore use collected local data while its handler write is
 * held.
 */
function selectCacheFillForConsumer(
  workStoreCacheEntryState: WorkStoreCacheEntryState,
  cacheConsumerFillRequest: CacheConsumerFillRequest,
  cacheReadContext: CacheReadContext,
  cacheGenerationInputs: CacheGenerationInputs
): CacheReadOperation {
  const { workStore, cacheConsumerContext, cacheHandler, logPrefix } =
    cacheReadContext.cacheCallContext
  const { implicitTags } = cacheReadContext

  const reusableWorkStoreCacheFill = getReusableWorkStoreCacheFill(
    workStoreCacheEntryState,
    workStore,
    cacheConsumerContext,
    implicitTags,
    logPrefix
  )
  if (reusableWorkStoreCacheFill !== undefined) {
    return reusableWorkStoreCacheFill.type === 'completed'
      ? {
          type: 'completed',
          result: reusableWorkStoreCacheFill.result,
          completion: reusableWorkStoreCacheFill.cacheFillAttempt.completion,
        }
      : {
          type: 'fill',
          cacheFillAttempt: reusableWorkStoreCacheFill.cacheFillAttempt,
        }
  }

  if (
    cacheConsumerFillRequest.cacheHandlerLookup !== undefined &&
    cacheConsumerFillRequest.cacheHandlerLookup !==
      workStoreCacheEntryState.cacheHandlerLookup
  ) {
    debug?.(logPrefix, 'reselecting after an obsolete lookup')
    return selectCacheReadOperation(workStoreCacheEntryState, cacheReadContext)
  }

  return {
    type: 'fill',
    cacheFillAttempt: getOrCreateCacheFillAttempt(
      workStoreCacheEntryState,
      cacheConsumerFillRequest,
      workStore,
      cacheConsumerContext,
      cacheHandler,
      implicitTags,
      cacheGenerationInputs,
      logPrefix
    ),
  }
}

/**
 * Registers a pending fill attempt in this WorkStore before asynchronous work
 * starts. Consumers can receive its result before the handler writes finish.
 */
function getOrCreateCacheFillAttempt(
  workStoreCacheEntryState: WorkStoreCacheEntryState,
  cacheFillAttemptRequest: CacheFillAttemptRequest,
  workStore: WorkStore,
  cacheConsumerContext: CacheConsumerContext,
  cacheHandler: CacheReadWriteHandler | undefined,
  implicitTags: string[],
  cacheGenerationInputs: CacheGenerationInputs,
  logPrefix: string
): CacheFillAttempt {
  const reusableWorkStoreCacheFill = getReusableWorkStoreCacheFill(
    workStoreCacheEntryState,
    workStore,
    cacheConsumerContext,
    implicitTags,
    logPrefix
  )
  if (reusableWorkStoreCacheFill !== undefined) {
    debug?.(
      logPrefix,
      'reusing WorkStore fill',
      reusableWorkStoreCacheFill.type,
      cacheFillAttemptRequest.cacheInvocationKeys.cacheHandlerKey
    )
    return reusableWorkStoreCacheFill.cacheFillAttempt
  }

  const cacheFillAttemptResultResolvers =
    createPromiseWithResolvers<CacheFillAttemptResult>()
  const cacheFillAttemptCompletionResolvers = createPromiseWithResolvers<void>()
  const cacheFillAttempt: CacheFillAttempt = {
    result: cacheFillAttemptResultResolvers.promise,
    completion: cacheFillAttemptCompletionResolvers.promise,
  }
  const pendingWorkStoreCacheFill: PendingWorkStoreCacheFill = {
    type: 'pending',
    cacheFillAttempt,
  }

  cacheFillAttempt.result.catch(ignoreReject)
  cacheFillAttempt.completion.catch(ignoreReject)

  const reservedCacheHandlerLookup = workStoreCacheEntryState.cacheHandlerLookup
  workStoreCacheEntryState.workStoreCacheFill = pendingWorkStoreCacheFill
  debug?.(
    logPrefix,
    'reserved WorkStore fill',
    cacheFillAttemptRequest.cacheInvocationKeys.cacheHandlerKey,
    cacheConsumerContext.outerWorkUnitStore.type
  )

  workStore.pendingRevalidateWrites ??= []
  workStore.pendingRevalidateWrites.push(cacheFillAttempt.completion)

  Promise.resolve()
    .then(() =>
      executeCacheFillAttempt(
        cacheFillAttemptRequest,
        workStore,
        cacheConsumerContext,
        cacheHandler,
        cacheGenerationInputs,
        logPrefix
      )
    )
    .then(async (cacheFillExecutionResult) => {
      if (cacheFillExecutionResult.result.type === 'retry-lookup') {
        settleWorkStoreCacheFill(
          workStoreCacheEntryState,
          pendingWorkStoreCacheFill,
          reservedCacheHandlerLookup,
          undefined,
          cacheFillExecutionResult.cacheInvocationKeys,
          cacheConsumerContext,
          true
        )
        cacheFillAttemptResultResolvers.resolve(cacheFillExecutionResult.result)
      } else {
        cacheFillAttemptResultResolvers.resolve(cacheFillExecutionResult.result)

        if (cacheFillExecutionResult.result.type === 'prerender-dynamic') {
          settleWorkStoreCacheFill(
            workStoreCacheEntryState,
            pendingWorkStoreCacheFill,
            reservedCacheHandlerLookup,
            undefined,
            undefined,
            cacheConsumerContext,
            true
          )
        } else {
          const metadata =
            await cacheFillExecutionResult.result.entry.pendingCompletion
          const completedWorkStoreCacheFill:
            | CompletedWorkStoreCacheFill
            | undefined = shouldRetainCacheResult(cacheConsumerContext)
            ? {
                type: 'completed',
                cacheFillAttempt,
                result: cacheFillExecutionResult.result,
                metadata,
              }
            : undefined

          settleWorkStoreCacheFill(
            workStoreCacheEntryState,
            pendingWorkStoreCacheFill,
            reservedCacheHandlerLookup,
            completedWorkStoreCacheFill,
            cacheFillExecutionResult.cacheInvocationKeys,
            cacheConsumerContext,
            true
          )
        }
      }

      await cacheFillExecutionResult.completion
      debug?.(
        logPrefix,
        'WorkStore fill settled',
        cacheFillAttemptRequest.cacheInvocationKeys.cacheHandlerKey
      )
      cacheFillAttemptCompletionResolvers.resolve()
    })
    .catch((error) => {
      debug?.(
        logPrefix,
        'WorkStore fill failed',
        cacheFillAttemptRequest.cacheInvocationKeys.cacheHandlerKey,
        error
      )
      settleWorkStoreCacheFill(
        workStoreCacheEntryState,
        pendingWorkStoreCacheFill,
        reservedCacheHandlerLookup,
        undefined,
        undefined,
        cacheConsumerContext,
        !shouldRetainCacheResult(cacheConsumerContext)
      )
      cacheFillAttemptResultResolvers.reject(error)
      cacheFillAttemptCompletionResolvers.reject(error)
    })

  return cacheFillAttempt
}

/**
 * Shares pending generation and verifies its root dependencies after writes
 * settle. Completed observations can delay key correction, but never provide
 * data.
 */
async function executeCacheFillAttempt(
  cacheFillAttemptRequest: CacheFillAttemptRequest,
  workStore: WorkStore,
  cacheConsumerContext: CacheConsumerContext,
  cacheHandler: CacheReadWriteHandler | undefined,
  cacheGenerationInputs: CacheGenerationInputs,
  logPrefix: string
): Promise<CacheFillExecutionResult> {
  const cacheInvocationKeys = cacheFillAttemptRequest.cacheInvocationKeys

  const lazyRefreshTags = workStore.refreshTagsByCacheKind.get(
    cacheConsumerContext.handlerKind
  )
  if (lazyRefreshTags && !isResolvedLazyResult(lazyRefreshTags)) {
    await lazyRefreshTags
  }

  const shareCacheFillAcrossWorkStores = canShareCacheFillAcrossWorkStores(
    workStore,
    cacheConsumerContext
  )
  let cacheFillOperation = shareCacheFillAcrossWorkStores
    ? (crossWorkStoreCacheFills.get(cacheInvocationKeys.cacheHandlerKey) ??
      getPendingObservedCacheFill(cacheFillAttemptRequest.cacheHandlerLookup))
    : undefined
  if (cacheFillOperation === undefined) {
    const observedCacheFill = getLastObservedCacheFill(
      cacheFillAttemptRequest.cacheHandlerLookup
    )
    if (observedCacheFill !== undefined) {
      // Root names can advance before persistence completes. Wait before using
      // those names to select a different handler key, even after a failed
      // write.
      await observedCacheFill.completion.catch(ignoreReject)
    }

    const cacheHandlerKey = getUpdatedCacheHandlerKey(
      cacheInvocationKeys,
      cacheConsumerContext
    )
    if (
      cacheHandlerKey !== cacheInvocationKeys.cacheHandlerKey ||
      (observedCacheFill !== undefined &&
        observedCacheFill.cacheInvocationKeys.cacheHandlerKey !==
          cacheInvocationKeys.cacheHandlerKey)
    ) {
      // A redirected get can finish before the observed producer's other
      // writes. Read that different target again after the producer settles.
      debug?.(logPrefix, 'retrying corrected cache key', cacheHandlerKey)
      return {
        result: { type: 'retry-lookup' },
        cacheInvocationKeys: { ...cacheInvocationKeys, cacheHandlerKey },
        completion: Promise.resolve(),
      }
    }

    cacheFillOperation = shareCacheFillAcrossWorkStores
      ? crossWorkStoreCacheFills.get(cacheInvocationKeys.cacheHandlerKey)
      : undefined
    if (cacheFillOperation === undefined) {
      debug?.(
        logPrefix,
        'starting cache fill',
        cacheInvocationKeys.cacheHandlerKey
      )
      cacheFillOperation = startCacheFillOperation(
        cacheInvocationKeys,
        workStore,
        cacheConsumerContext,
        cacheHandler,
        cacheGenerationInputs,
        logPrefix
      )
      return {
        result: await cacheFillOperation.result,
        cacheInvocationKeys,
        completion: cacheFillOperation.completion,
      }
    }
  }

  debug?.(
    logPrefix,
    'joining pending cross-WorkStore fill',
    cacheFillOperation.cacheInvocationKeys.cacheHandlerKey
  )
  const sharedCacheFillResult = await cacheFillOperation.result
  if (sharedCacheFillResult.type === 'generated') {
    const metadata = await sharedCacheFillResult.entry.pendingCompletion
    if (metadata.readRootParamNames) {
      addKnownRootParamNames(
        cacheConsumerContext.functionId,
        metadata.readRootParamNames
      )
    }
  }

  const cacheHandlerKey = getUpdatedCacheHandlerKey(
    cacheFillOperation.cacheInvocationKeys,
    cacheConsumerContext
  )

  // The producer reports write failures. Joiners wait for its writes to settle
  // without inheriting those failures.
  const pendingCacheFillCompletion =
    cacheFillOperation.completion.catch(ignoreReject)

  if (
    cacheHandlerKey === cacheFillOperation.cacheInvocationKeys.cacheHandlerKey
  ) {
    return {
      result: sharedCacheFillResult,
      cacheInvocationKeys: cacheFillOperation.cacheInvocationKeys,
      completion: pendingCacheFillCompletion,
    }
  }

  debug?.(logPrefix, 'retrying corrected cache key', cacheHandlerKey)
  return {
    result: { type: 'retry-lookup' },
    cacheInvocationKeys: {
      ...cacheFillOperation.cacheInvocationKeys,
      cacheHandlerKey,
    },
    completion: pendingCacheFillCompletion,
  }
}

/**
 * Registers generation before it can yield. Its result exposes generated data
 * early; its completion covers collection and all handler writes.
 */
function startCacheFillOperation(
  cacheInvocationKeys: CacheInvocationKeys,
  workStore: WorkStore,
  cacheConsumerContext: CacheConsumerContext,
  cacheHandler: CacheReadWriteHandler | undefined,
  cacheGenerationInputs: CacheGenerationInputs,
  logPrefix: string
): CacheFillOperation {
  const cacheFillResultResolvers =
    createPromiseWithResolvers<SharedCacheFillResult>()
  const cacheFillCompletionResolvers =
    createPromiseWithResolvers<CacheFillCompletion>()
  const cacheFillOperation: CacheFillOperation = {
    cacheInvocationKeys,
    result: cacheFillResultResolvers.promise,
    completion: cacheFillCompletionResolvers.promise,
  }

  cacheFillOperation.result.catch(ignoreReject)
  cacheFillOperation.completion.catch(ignoreReject)

  if (canShareCacheFillAcrossWorkStores(workStore, cacheConsumerContext)) {
    crossWorkStoreCacheFills.set(
      cacheInvocationKeys.cacheHandlerKey,
      cacheFillOperation
    )
  }

  Promise.resolve()
    .then(async (): Promise<CacheFillCompletion> => {
      const generatedCacheEntryResult = await generateCacheEntry(
        workStore,
        cacheConsumerContext,
        cacheGenerationInputs.clientReferenceManifest,
        cacheGenerationInputs.encodedCacheKeyParts,
        cacheGenerationInputs.functionToCache,
        cacheGenerationInputs.timeoutError,
        cacheGenerationInputs.deadlockError
      )
      if (generatedCacheEntryResult.type === 'prerender-dynamic') {
        cacheFillResultResolvers.resolve(generatedCacheEntryResult)
        return 'prerender-dynamic'
      }

      const pendingCacheHandlerWrite =
        cacheHandler !== undefined && !workStore.isDraftMode
          ? saveToCacheHandler(
              cacheHandler,
              cacheConsumerContext.functionId,
              cacheInvocationKeys.cacheHandlerKeyBase,
              generatedCacheEntryResult.pendingCacheResult.then(
                cloneCollectedCacheResult
              ),
              cacheConsumerContext.outerWorkUnitStore.rootParams
            )
          : undefined
      const sharedCacheEntry = new SharedCacheEntry(
        generatedCacheEntryResult.stream,
        generatedCacheEntryResult.pendingCacheResult,
        pendingCacheHandlerWrite
      )

      debug?.(
        logPrefix,
        'generated stream available',
        cacheInvocationKeys.cacheHandlerKey
      )
      cacheFillResultResolvers.resolve({
        type: 'generated',
        entry: sharedCacheEntry,
      })

      await sharedCacheEntry.pendingCompletion
      await pendingCacheHandlerWrite
      return 'generated'
    })
    .then(
      (cacheFillCompletion) => {
        if (
          crossWorkStoreCacheFills.get(cacheInvocationKeys.cacheHandlerKey) ===
          cacheFillOperation
        ) {
          crossWorkStoreCacheFills.delete(cacheInvocationKeys.cacheHandlerKey)
        }

        debug?.(
          logPrefix,
          'cross-WorkStore fill completed',
          cacheInvocationKeys.cacheHandlerKey
        )
        cacheFillCompletionResolvers.resolve(cacheFillCompletion)
      },
      (error) => {
        if (
          crossWorkStoreCacheFills.get(cacheInvocationKeys.cacheHandlerKey) ===
          cacheFillOperation
        ) {
          crossWorkStoreCacheFills.delete(cacheInvocationKeys.cacheHandlerKey)
        }

        debug?.(
          logPrefix,
          'cross-WorkStore fill failed',
          cacheInvocationKeys.cacheHandlerKey,
          error
        )
        cacheFillResultResolvers.reject(error)
        cacheFillCompletionResolvers.reject(error)
      }
    )

  return cacheFillOperation
}

/**
 * Applies one complete transition only while this pending fill attempt owns the
 * slot. Generated/retry outcomes publish keys and release the captured lookup.
 * Dynamic outcomes release it without changing keys. Failures retain custom
 * lookups for later callers; built-in lookups can be released. A successor
 * lookup is preserved.
 */
function settleWorkStoreCacheFill(
  workStoreCacheEntryState: WorkStoreCacheEntryState,
  pendingWorkStoreCacheFill: PendingWorkStoreCacheFill,
  cacheHandlerLookup: CacheHandlerLookup | undefined,
  completedWorkStoreCacheFill: CompletedWorkStoreCacheFill | undefined,
  cacheInvocationKeys: CacheInvocationKeys | undefined,
  cacheConsumerContext: CacheConsumerContext,
  releaseHandlerLookup: boolean
): void {
  if (
    workStoreCacheEntryState.workStoreCacheFill !== pendingWorkStoreCacheFill
  ) {
    return
  }

  if (cacheInvocationKeys !== undefined) {
    workStoreCacheEntryState.cacheInvocationKeys = {
      ...cacheInvocationKeys,
      cacheHandlerKey: getUpdatedCacheHandlerKey(
        cacheInvocationKeys,
        cacheConsumerContext
      ),
    }
  }

  if (
    releaseHandlerLookup &&
    workStoreCacheEntryState.cacheHandlerLookup === cacheHandlerLookup
  ) {
    workStoreCacheEntryState.cacheHandlerLookup = undefined
  }

  workStoreCacheEntryState.workStoreCacheFill = completedWorkStoreCacheFill
}

/**
 * Revalidates a served entry without delaying the response or writing to the
 * Resume Data Cache. A root-key correction repeats the lookup before another
 * fill can start. An observed fill can avoid regeneration only if it completed
 * successfully for the same key and the handler entry remains valid.
 */
function startBackgroundCacheRevalidation(
  workStoreCacheEntryState: WorkStoreCacheEntryState,
  cacheConsumerFillRequest: CacheConsumerFillRequest,
  cacheReadContext: CacheReadContext,
  cacheGenerationInputs: CacheGenerationInputs
): void {
  const { workStore, cacheConsumerContext, logPrefix } =
    cacheReadContext.cacheCallContext
  const { implicitTags } = cacheReadContext

  let backgroundCacheRevalidationOperation = selectBackgroundCacheRevalidation(
    workStoreCacheEntryState,
    cacheConsumerFillRequest,
    cacheReadContext,
    cacheGenerationInputs
  )

  const pendingBackgroundRevalidation = (async () => {
    let pendingCacheFillCompletion: Promise<void> = Promise.resolve()
    try {
      while (true) {
        if (
          backgroundCacheRevalidationOperation.type === 'observed-completion'
        ) {
          const {
            observedCacheFill,
            cacheConsumerFillRequest: observedCacheConsumerFillRequest,
          } = backgroundCacheRevalidationOperation

          const observedCacheFillCompletion =
            await observedCacheFill.completion.catch(ignoreReject)
          const isCacheHandlerHitStillValid =
            observedCacheConsumerFillRequest.validatedCacheHandlerHit !==
              undefined &&
            (await isValidCacheHandlerHit(
              observedCacheConsumerFillRequest.validatedCacheHandlerHit,
              workStore,
              cacheConsumerContext,
              implicitTags,
              logPrefix
            ))

          const reusableWorkStoreCacheFill = getReusableWorkStoreCacheFill(
            workStoreCacheEntryState,
            workStore,
            cacheConsumerContext,
            implicitTags,
            logPrefix
          )
          const pendingCacheFillOperation = canShareCacheFillAcrossWorkStores(
            workStore,
            cacheConsumerContext
          )
            ? (crossWorkStoreCacheFills.get(
                observedCacheConsumerFillRequest.cacheInvocationKeys
                  .cacheHandlerKey
              ) ??
              getPendingObservedCacheFill(
                observedCacheConsumerFillRequest.cacheHandlerLookup
              ))
            : undefined

          const cacheHandlerKey = getUpdatedCacheHandlerKey(
            observedCacheConsumerFillRequest.cacheInvocationKeys,
            cacheConsumerContext
          )
          if (
            reusableWorkStoreCacheFill === undefined &&
            pendingCacheFillOperation === undefined &&
            observedCacheConsumerFillRequest.cacheInvocationKeys
              .cacheHandlerKey ===
              workStoreCacheEntryState.cacheInvocationKeys.cacheHandlerKey &&
            observedCacheFillCompletion === 'generated' &&
            isCacheHandlerHitStillValid &&
            observedCacheFill.cacheInvocationKeys.cacheHandlerKey ===
              observedCacheConsumerFillRequest.cacheInvocationKeys
                .cacheHandlerKey &&
            cacheHandlerKey ===
              observedCacheConsumerFillRequest.cacheInvocationKeys
                .cacheHandlerKey &&
            !shouldForceRevalidate(
              workStore,
              cacheConsumerContext.outerWorkUnitStore
            )
          ) {
            debug?.(
              logPrefix,
              'suppressing completed background refresh',
              cacheHandlerKey
            )
            return
          }

          // A different key still needs a lookup. Acquire a fill attempt so its
          // guarded settlement publishes the correction before consumers retry.
          backgroundCacheRevalidationOperation = selectCacheFillForConsumer(
            workStoreCacheEntryState,
            observedCacheConsumerFillRequest,
            cacheReadContext,
            cacheGenerationInputs
          )
          continue
        }

        if (
          backgroundCacheRevalidationOperation.type === 'fill' ||
          backgroundCacheRevalidationOperation.type === 'completed'
        ) {
          const cacheFillAttemptResult =
            backgroundCacheRevalidationOperation.type === 'fill'
              ? await backgroundCacheRevalidationOperation.cacheFillAttempt
                  .result
              : backgroundCacheRevalidationOperation.result
          pendingCacheFillCompletion =
            backgroundCacheRevalidationOperation.type === 'fill'
              ? backgroundCacheRevalidationOperation.cacheFillAttempt.completion
              : backgroundCacheRevalidationOperation.completion
          if (cacheFillAttemptResult.type === 'retry-lookup') {
            await pendingCacheFillCompletion
            backgroundCacheRevalidationOperation = selectCacheReadOperation(
              workStoreCacheEntryState,
              cacheReadContext
            )
            continue
          }

          await pendingCacheFillCompletion
          if (cacheFillAttemptResult.type === 'generated') {
            await cacheFillAttemptResult.entry.pendingCompletion
          }
          return
        }

        let nextCacheConsumerFillRequest: CacheConsumerFillRequest
        if (backgroundCacheRevalidationOperation.type === 'forced-miss') {
          nextCacheConsumerFillRequest = {
            cacheInvocationKeys:
              backgroundCacheRevalidationOperation.cacheInvocationKeys,
            cacheHandlerLookup: undefined,
            validatedCacheHandlerHit: undefined,
          }
        } else {
          const cacheHandlerLookup =
            backgroundCacheRevalidationOperation.cacheHandlerLookup
          const cacheHandlerLookupResult = await cacheHandlerLookup.result
          const cacheInvocationKeys = {
            ...cacheHandlerLookup.cacheInvocationKeys,
            cacheHandlerKey: cacheHandlerLookupResult.cacheHandlerKey,
          }

          const validatedCacheHandlerHit =
            cacheHandlerLookupResult.type === 'handler-hit' &&
            (await isValidCacheHandlerHit(
              cacheHandlerLookupResult,
              workStore,
              cacheConsumerContext,
              implicitTags,
              logPrefix
            ))
              ? cacheHandlerLookupResult
              : undefined
          if (validatedCacheHandlerHit !== undefined) {
            const cacheHandlerHitClassification = classifyCacheHandlerHit(
              validatedCacheHandlerHit.entry,
              cacheConsumerContext
            )
            if (
              !cacheHandlerHitClassification.requiresGeneration &&
              !cacheHandlerHitClassification.requiresRevalidation
            ) {
              await pendingCacheFillCompletion
              return
            }
          }

          nextCacheConsumerFillRequest = {
            cacheInvocationKeys,
            cacheHandlerLookup,
            validatedCacheHandlerHit,
          }
        }

        backgroundCacheRevalidationOperation =
          selectBackgroundCacheRevalidation(
            workStoreCacheEntryState,
            nextCacheConsumerFillRequest,
            cacheReadContext,
            cacheGenerationInputs
          )
      }
    } finally {
      releaseCacheHandlerLookup(
        workStoreCacheEntryState,
        backgroundCacheRevalidationOperation.type === 'lookup'
          ? backgroundCacheRevalidationOperation.cacheHandlerLookup
          : undefined,
        cacheConsumerContext
      )
    }
  })()

  pendingBackgroundRevalidation.catch((error) => {
    debug?.(logPrefix, 'background cache revalidation failed', error)
  })

  workStore.pendingRevalidateWrites ??= []
  workStore.pendingRevalidateWrites.push(pendingBackgroundRevalidation)
}

/**
 * Selects a fill attempt or an observed completion for background revalidation.
 * A completed observation can avoid another fill for this background consumer.
 */
function selectBackgroundCacheRevalidation(
  workStoreCacheEntryState: WorkStoreCacheEntryState,
  cacheConsumerFillRequest: CacheConsumerFillRequest,
  cacheReadContext: CacheReadContext,
  cacheGenerationInputs: CacheGenerationInputs
): BackgroundCacheRevalidationOperation {
  const { workStore, cacheConsumerContext, logPrefix } =
    cacheReadContext.cacheCallContext
  const { implicitTags } = cacheReadContext

  const reusableWorkStoreCacheFill = getReusableWorkStoreCacheFill(
    workStoreCacheEntryState,
    workStore,
    cacheConsumerContext,
    implicitTags,
    logPrefix
  )
  const pendingCacheFillOperation = canShareCacheFillAcrossWorkStores(
    workStore,
    cacheConsumerContext
  )
    ? (crossWorkStoreCacheFills.get(
        cacheConsumerFillRequest.cacheInvocationKeys.cacheHandlerKey
      ) ??
      getPendingObservedCacheFill(cacheConsumerFillRequest.cacheHandlerLookup))
    : undefined

  // Suppression is key-scoped. Releasing a built-in lookup must not make other
  // background consumers repeat work covered by the same completed observation.
  const observedCacheFill =
    reusableWorkStoreCacheFill === undefined &&
    pendingCacheFillOperation === undefined &&
    cacheConsumerFillRequest.validatedCacheHandlerHit !== undefined &&
    cacheConsumerFillRequest.cacheHandlerLookup !== undefined &&
    cacheConsumerFillRequest.cacheInvocationKeys.cacheHandlerKey ===
      workStoreCacheEntryState.cacheInvocationKeys.cacheHandlerKey &&
    !shouldForceRevalidate(workStore, cacheConsumerContext.outerWorkUnitStore)
      ? getLastObservedCacheFill(cacheConsumerFillRequest.cacheHandlerLookup)
      : undefined

  return observedCacheFill === undefined
    ? selectCacheFillForConsumer(
        workStoreCacheEntryState,
        cacheConsumerFillRequest,
        cacheReadContext,
        cacheGenerationInputs
      )
    : {
        type: 'observed-completion',
        cacheConsumerFillRequest,
        observedCacheFill,
      }
}

/**
 * Reserves one WorkStore's handler lookup. Each get records an actual pending
 * fill's key and completion identity before calling the handler. A miss retries
 * once if that fill finished writing during the read. The native lookup promise
 * must not have extra rejection handlers, which cause V8 to omit the awaiting
 * caller from error stacks.
 */
function startCacheHandlerLookup(
  workStoreCacheEntryState: WorkStoreCacheEntryState,
  cacheInvocationKeys: CacheInvocationKeys,
  workStore: WorkStore,
  cacheConsumerContext: CacheConsumerContext,
  cacheHandler: CacheReadWriteHandler | undefined,
  implicitTags: string[],
  logPrefix: string
): CacheHandlerLookup {
  const observedCacheFills: ObservedCacheFill[] = []
  const cacheHandlerLookup: CacheHandlerLookup = {
    cacheInvocationKeys,
    result: readCacheHandler(),
    observedCacheFills,
  }
  workStoreCacheEntryState.cacheHandlerLookup = cacheHandlerLookup
  return cacheHandlerLookup

  async function readCacheHandler(): Promise<SharedCacheLookupResult> {
    // Defer the handler call until this lookup is registered.
    await undefined

    try {
      const lazyRefreshTags = workStore.refreshTagsByCacheKind.get(
        cacheConsumerContext.handlerKind
      )
      if (lazyRefreshTags && !isResolvedLazyResult(lazyRefreshTags)) {
        await lazyRefreshTags
      }

      if (cacheHandler === undefined) {
        return {
          type: 'miss',
          cacheHandlerKey: cacheInvocationKeys.cacheHandlerKey,
        }
      }

      const rootParams = cacheConsumerContext.outerWorkUnitStore.rootParams
      let cacheLookupKeys = cacheInvocationKeys
      let hasFollowedRootParamRedirect = false
      let hasRetriedAfterCompletedFill = false
      while (true) {
        const pendingCacheFillOperation = canShareCacheFillAcrossWorkStores(
          workStore,
          cacheConsumerContext
        )
          ? crossWorkStoreCacheFills.get(cacheLookupKeys.cacheHandlerKey)
          : undefined
        const observedCacheFill: ObservedCacheFill | undefined =
          pendingCacheFillOperation === undefined
            ? undefined
            : {
                cacheInvocationKeys: cacheLookupKeys,
                completion: pendingCacheFillOperation.completion,
              }
        if (observedCacheFill !== undefined) {
          observedCacheFills.push(observedCacheFill)
        }

        debug?.(
          logPrefix,
          'reading cache handler',
          cacheLookupKeys.cacheHandlerKey
        )
        const entry = await cacheHandler.get(
          cacheLookupKeys.cacheHandlerKey,
          implicitTags
        )
        debug?.(
          logPrefix,
          entry === undefined ? 'handler miss' : 'handler hit',
          cacheLookupKeys.cacheHandlerKey
        )

        // This lookup retries a miss once after an observed fill finishes
        // writing. The handler still validates the entry against this
        // consumer's implicit tags.
        if (
          entry === undefined &&
          !hasRetriedAfterCompletedFill &&
          observedCacheFill !== undefined &&
          crossWorkStoreCacheFills.get(cacheLookupKeys.cacheHandlerKey)
            ?.completion !== observedCacheFill.completion &&
          !shouldForceRevalidate(
            workStore,
            cacheConsumerContext.outerWorkUnitStore
          ) &&
          (await observedCacheFill.completion.catch(ignoreReject)) ===
            'generated'
        ) {
          hasRetriedAfterCompletedFill = true
          debug?.(
            logPrefix,
            'retrying handler lookup after completed fill',
            cacheLookupKeys.cacheHandlerKey
          )
          continue
        }

        // Coarse entries describe root dependencies instead of carrying data.
        // Resolve that redirect before publishing this WorkStore's handler
        // answer.
        if (entry && rootParams && !hasFollowedRootParamRedirect) {
          const rootParamNames = new Set<string>()
          for (const tag of entry.tags) {
            if (tag.startsWith(NEXT_CACHE_ROOT_PARAM_TAG_ID)) {
              rootParamNames.add(tag.slice(NEXT_CACHE_ROOT_PARAM_TAG_ID.length))
            }
          }
          if (rootParamNames.size > 0) {
            addKnownRootParamNames(
              cacheConsumerContext.functionId,
              rootParamNames
            )
            cacheLookupKeys = {
              ...cacheLookupKeys,
              cacheHandlerKey:
                cacheInvocationKeys.cacheHandlerKeyBase +
                computeRootParamsCacheKeySuffix(rootParams, rootParamNames),
            }
            hasFollowedRootParamRedirect = true
            continue
          }
        }

        if (
          workStoreCacheEntryState.cacheHandlerLookup === cacheHandlerLookup
        ) {
          workStoreCacheEntryState.cacheInvocationKeys = cacheLookupKeys
        }

        return entry === undefined
          ? {
              type: 'miss',
              cacheHandlerKey: cacheLookupKeys.cacheHandlerKey,
            }
          : {
              type: 'handler-hit',
              entry: { ...entry, tags: [...entry.tags] },
              cacheHandlerKey: cacheLookupKeys.cacheHandlerKey,
            }
      }
    } catch (error) {
      if (workStoreCacheEntryState.cacheHandlerLookup === cacheHandlerLookup) {
        workStoreCacheEntryState.cacheHandlerLookup = undefined
      }
      throw error
    }
  }
}

/**
 * Releases only the selected built-in lookup after active local work settles. A
 * successor lookup and references needed by a pending fill remain available.
 */
function releaseCacheHandlerLookup(
  workStoreCacheEntryState: WorkStoreCacheEntryState,
  cacheHandlerLookup: CacheHandlerLookup | undefined,
  cacheConsumerContext: CacheConsumerContext
): void {
  if (
    !shouldRetainCacheResult(cacheConsumerContext) &&
    workStoreCacheEntryState.workStoreCacheFill?.type !== 'pending' &&
    workStoreCacheEntryState.cacheHandlerLookup === cacheHandlerLookup
  ) {
    workStoreCacheEntryState.cacheHandlerLookup = undefined
  }
}

/**
 * Reuses pending fills or valid completed data from this WorkStore. Invalid
 * completed data is removed only if no other fill has replaced it.
 */
function getReusableWorkStoreCacheFill(
  workStoreCacheEntryState: WorkStoreCacheEntryState,
  workStore: WorkStore,
  cacheConsumerContext: CacheConsumerContext,
  implicitTags: string[],
  logPrefix: string
): WorkStoreCacheFill | undefined {
  const workStoreCacheFill = workStoreCacheEntryState.workStoreCacheFill
  if (
    workStoreCacheFill === undefined ||
    workStoreCacheFill.type === 'pending'
  ) {
    return workStoreCacheFill
  }

  if (
    isReusableCompletedCacheFill(
      workStoreCacheFill,
      workStore,
      cacheConsumerContext,
      implicitTags,
      logPrefix
    )
  ) {
    return workStoreCacheFill
  }

  debug?.(logPrefix, 'discarding completed local fill')
  if (workStoreCacheEntryState.workStoreCacheFill === workStoreCacheFill) {
    workStoreCacheEntryState.workStoreCacheFill = undefined
  }
  return undefined
}

/**
 * Validates generated data retained in this WorkStore. It does not reinterpret
 * the result as a handler hit. Forced revalidation bypasses completed data
 * while pending fill attempts remain shareable through the separate acquisition
 * path.
 */
function isReusableCompletedCacheFill(
  completedWorkStoreCacheFill: CompletedWorkStoreCacheFill,
  workStore: WorkStore,
  cacheConsumerContext: CacheConsumerContext,
  implicitTags: string[],
  logPrefix: string
): boolean {
  const workUnitStore = cacheConsumerContext.outerWorkUnitStore
  return (
    !shouldForceRevalidate(workStore, workUnitStore) &&
    !shouldDiscardCacheEntry(
      completedWorkStoreCacheFill.metadata,
      workStore,
      workUnitStore,
      implicitTags,
      0,
      logPrefix
    )
  )
}

/**
 * Retains private and custom-handler data for local reuse. Private calls need
 * consistency within their WorkStore; custom reads may require remote I/O.
 * Built-in public entries need no extra WorkStore retention of their stream
 * branches.
 */
function shouldRetainCacheResult(
  cacheConsumerContext: CacheConsumerContext
): boolean {
  return (
    cacheConsumerContext.kind === 'private' ||
    !isBuiltInCacheHandler(cacheConsumerContext.handlerKind)
  )
}

/**
 * Draft fills can contain uncached request data. Production private caches stay
 * within their WorkStore; only development persists and shares private fills.
 */
function canShareCacheFillAcrossWorkStores(
  workStore: WorkStore,
  cacheConsumerContext: CacheConsumerContext
): boolean {
  return (
    !workStore.isDraftMode &&
    (cacheConsumerContext.kind !== 'private' || !!process.env.__NEXT_DEV_SERVER)
  )
}

/**
 * Recovers only a fill that is still registered with its captured completion
 * identity. Completed observations retain no generated streams or metadata.
 */
function getPendingObservedCacheFill(
  cacheHandlerLookup: CacheHandlerLookup | undefined
): CacheFillOperation | undefined {
  if (cacheHandlerLookup === undefined) {
    return undefined
  }

  for (
    let index = cacheHandlerLookup.observedCacheFills.length - 1;
    index >= 0;
    index--
  ) {
    const observedCacheFill = cacheHandlerLookup.observedCacheFills[index]
    const pendingCacheFillOperation = crossWorkStoreCacheFills.get(
      observedCacheFill.cacheInvocationKeys.cacheHandlerKey
    )
    if (
      pendingCacheFillOperation?.completion === observedCacheFill.completion
    ) {
      return pendingCacheFillOperation
    }
  }

  return undefined
}

/**
 * Returns the last actual observation, which may precede a root redirect. Its
 * captured key does not establish that a different final lookup key is warm.
 */
function getLastObservedCacheFill(
  cacheHandlerLookup: CacheHandlerLookup | undefined
): ObservedCacheFill | undefined {
  return cacheHandlerLookup?.observedCacheFills[
    cacheHandlerLookup.observedCacheFills.length - 1
  ]
}

/**
 * Applies known root dependencies to an immutable key snapshot using this
 * consumer's root values. Callers must settle an observed producer before
 * retrying.
 */
function getUpdatedCacheHandlerKey(
  cacheInvocationKeys: CacheInvocationKeys,
  cacheConsumerContext: CacheConsumerContext
): string {
  const rootParams = cacheConsumerContext.outerWorkUnitStore.rootParams
  const rootParamNames = knownRootParamsByFunctionId.get(
    cacheConsumerContext.functionId
  )
  return rootParamNames && rootParams
    ? cacheInvocationKeys.cacheHandlerKeyBase +
        computeRootParamsCacheKeySuffix(rootParams, rootParamNames)
    : cacheInvocationKeys.cacheHandlerKey
}

/**
 * Checks a handler answer in this consumer's invalidation and revalidation
 * context. Validity does not decide whether to serve, omit, or revalidate that
 * answer.
 */
async function isValidCacheHandlerHit(
  sharedCacheHandlerHit: SharedCacheHandlerHit,
  workStore: WorkStore,
  cacheConsumerContext: CacheConsumerContext,
  implicitTags: string[],
  logPrefix: string
): Promise<boolean> {
  return (
    !shouldForceRevalidate(
      workStore,
      cacheConsumerContext.outerWorkUnitStore
    ) &&
    !shouldDiscardCacheEntry(
      sharedCacheHandlerHit.entry,
      workStore,
      cacheConsumerContext.outerWorkUnitStore,
      implicitTags,
      await getImplicitTagsExpiration(cacheConsumerContext),
      logPrefix
    )
  )
}

async function getImplicitTagsExpiration(
  cacheConsumerContext: CacheConsumerContext
): Promise<number> {
  const lazyExpiration =
    cacheConsumerContext.outerWorkUnitStore.implicitTags?.expirationsByCacheKind.get(
      cacheConsumerContext.handlerKind
    )
  if (lazyExpiration === undefined) {
    return 0
  }

  const expiration = isResolvedLazyResult(lazyExpiration)
    ? lazyExpiration.value
    : await lazyExpiration
  return expiration < Infinity ? expiration : 0
}

/**
 * Preserves the entry's real lifetime for consumer policy. Development retains
 * short-expire entries long enough for warm reloads, then revalidates them even
 * before their revalidate age. Disabled built-in memory caching also rewarms.
 */
function classifyCacheHandlerHit(
  entry: CacheEntry,
  cacheConsumerContext: CacheConsumerContext
): { requiresGeneration: boolean; requiresRevalidation: boolean } {
  const currentTime = performance.timeOrigin + performance.now()
  const workUnitStore = cacheConsumerContext.outerWorkUnitStore
  const expired =
    currentTime >
    entry.timestamp +
      (process.env.__NEXT_DEV_SERVER
        ? Math.max(entry.expire, MIN_PRERENDERABLE_EXPIRE)
        : entry.expire) *
        1000
  const stale = currentTime > entry.timestamp + entry.revalidate * 1000

  let requiresDevelopmentRevalidation = false
  if (
    process.env.__NEXT_DEV_SERVER &&
    (entry.expire < MIN_PRERENDERABLE_EXPIRE ||
      (isMemoryCacheDisabled() &&
        !isCustomCacheHandler(cacheConsumerContext.handlerKind)))
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
  sharedCacheHandlerHit: SharedCacheHandlerHit,
  cacheConsumerContext: CacheConsumerContext
): CacheResultMetadata {
  return {
    tags: sharedCacheHandlerHit.entry.tags,
    revalidate: sharedCacheHandlerHit.entry.revalidate,
    expire: sharedCacheHandlerHit.entry.expire,
    stale: sharedCacheHandlerHit.entry.stale,
    timestamp: sharedCacheHandlerHit.entry.timestamp,
    readRootParamNames: knownRootParamsByFunctionId.get(
      cacheConsumerContext.functionId
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
  cacheConsumerContext: CacheConsumerContext,
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
    cacheConsumerContext,
    clientReferenceManifest,
    encodedCacheKeyParts,
    functionToCache,
    timeoutError,
    deadlockError
  )
}

function generateCacheEntryWithRestoredWorkStore(
  workStore: WorkStore,
  cacheConsumerContext: CacheConsumerContext,
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
    generateCacheEntryWithCacheConsumerContext,
    workStore,
    cacheConsumerContext,
    clientReferenceManifest,
    encodedCacheKeyParts,
    functionToCache,
    timeoutError,
    deadlockError
  )
}

function generateCacheEntryWithCacheConsumerContext(
  workStore: WorkStore,
  cacheConsumerContext: CacheConsumerContext,
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
    cacheConsumerContext,
    defaultCacheLife
  )

  return workUnitAsyncStorage.run(cacheStore, () =>
    dynamicAccessAsyncStorage.run(
      { abortController: new AbortController(), reason: null },
      generateCacheEntryImpl,
      workStore,
      cacheConsumerContext,
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
  cacheConsumerContext: CacheConsumerContext,
  innerCacheStore: UseCacheStore,
  clientReferenceManifest: DeepReadonly<ClientReferenceManifest>,
  encodedCacheKeyParts: FormData | string,
  functionToCache: (...functionArguments: unknown[]) => Promise<unknown>,
  timeoutError: UseCacheTimeoutError,
  deadlockError: UseCacheDeadlockError | undefined
): Promise<GenerateCacheEntryResult> {
  const temporaryReferences = createServerTemporaryReferenceSet()
  const outerWorkUnitStore = cacheConsumerContext.outerWorkUnitStore

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
            cacheConsumerContext.functionId,
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
            cacheContext: cacheConsumerContext,
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
    cacheConsumerContext,
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
  cacheConsumerContext: CacheConsumerContext,
  defaultCacheLife: Required<CacheLife>
): UseCacheStore {
  if (cacheConsumerContext.kind === 'private') {
    const outerWorkUnitStore = cacheConsumerContext.outerWorkUnitStore
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
      outerOwnerStack: cacheConsumerContext.outerOwnerStack,
    }
  } else {
    let useCacheOrRequestStore: RequestStore | UseCacheStore | undefined
    const outerWorkUnitStore = cacheConsumerContext.outerWorkUnitStore
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
      outerOwnerStack: cacheConsumerContext.outerOwnerStack,
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
  cacheConsumerContext: CacheConsumerContext,
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
    process.env.__NEXT_DEV_SERVER && cacheConsumerContext.kind === 'private'
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
  cacheConsumerContext: CacheConsumerContext,
  metadata: CacheResultMetadata
): void {
  const outerWorkUnitStore = cacheConsumerContext.outerWorkUnitStore
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
      propagateCacheEntryMetadata(cacheConsumerContext, metadata)
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
  cacheConsumerContext: CacheConsumerContext,
  metadata: CacheResultMetadata
): void {
  if (cacheConsumerContext.kind === 'private') {
    switch (cacheConsumerContext.outerWorkUnitStore.type) {
      case 'private-cache':
        if (metadata.readRootParamNames) {
          for (const paramName of metadata.readRootParamNames) {
            cacheConsumerContext.outerWorkUnitStore.readRootParamNames.add(
              paramName
            )
          }
        }
      // fallthrough
      case 'prerender-runtime':
        propagateCacheLifeAndTagsToRevalidateStore(
          cacheConsumerContext.outerWorkUnitStore,
          metadata
        )
        break
      case 'request':
        propagateCacheStaleTimeToRequestStore(
          cacheConsumerContext.outerWorkUnitStore,
          metadata
        )
        break
      case undefined:
        break
      default:
        cacheConsumerContext.outerWorkUnitStore satisfies never
    }
  } else {
    switch (cacheConsumerContext.outerWorkUnitStore.type) {
      case 'cache':
        // If this entry's cache life is dynamic, record this invocation as the
        // origin to use as `cause` when the outer cache surfaces the
        // nested-dynamic cache error. `??=` keeps the first occurrence so the
        // cause points at the immediate dynamic child.
        if (
          cacheConsumerContext.dynamicNestedCacheError !== undefined &&
          (metadata.revalidate === 0 ||
            metadata.expire < MIN_PRERENDERABLE_EXPIRE)
        ) {
          cacheConsumerContext.outerWorkUnitStore.dynamicNestedCacheError ??=
            cacheConsumerContext.dynamicNestedCacheError
        }
      // fallthrough
      case 'private-cache':
        if (metadata.readRootParamNames) {
          for (const paramName of metadata.readRootParamNames) {
            cacheConsumerContext.outerWorkUnitStore.readRootParamNames.add(
              paramName
            )
          }
        }
      // fallthrough
      case 'prerender':
      case 'prerender-runtime':
      case 'prerender-legacy':
        propagateCacheLifeAndTagsToRevalidateStore(
          cacheConsumerContext.outerWorkUnitStore,
          metadata
        )
        break
      case 'request':
        propagateCacheStaleTimeToRequestStore(
          cacheConsumerContext.outerWorkUnitStore,
          metadata
        )
        break
      case 'unstable-cache':
      case 'build-time-generator':
        break
      default:
        cacheConsumerContext.outerWorkUnitStore satisfies never
    }
  }

  if (metadata.readRootParamNames) {
    const varyParamsAccumulator = getVaryParamsAccumulator(
      cacheConsumerContext.outerWorkUnitStore
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

function ignoreReject() {}
