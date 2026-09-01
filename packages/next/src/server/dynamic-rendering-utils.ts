import { InvariantError } from '../shared/lib/invariant-error'
import { createPromiseWithResolvers } from '../shared/lib/promise-with-resolvers'
import {
  RenderStage,
  type StagedRenderingController,
  type AdvanceableRenderStage,
} from './app-render/staged-rendering'
import { workAsyncStorage } from './app-render/work-async-storage.external'
import type {
  RequestStore,
  WorkUnitStore,
} from './app-render/work-unit-async-storage.external'
import { workUnitAsyncStorage } from './app-render/work-unit-async-storage.external'
import { getServerReact, getClientReact } from './runtime-reacts.external'

export function isHangingPromiseRejectionError(
  err: unknown
): err is HangingPromiseRejectionError {
  if (typeof err !== 'object' || err === null || !('digest' in err)) {
    return false
  }

  return err.digest === HANGING_PROMISE_REJECTION
}

const HANGING_PROMISE_REJECTION = 'HANGING_PROMISE_REJECTION'

class HangingPromiseRejectionError extends Error {
  public readonly digest = HANGING_PROMISE_REJECTION

  constructor(
    public readonly route: string,
    public readonly expression: string
  ) {
    super(
      `During prerendering, ${expression} rejects when the prerender is complete. Typically these errors are handled by React but if you move ${expression} to a different context by using \`setTimeout\`, \`after\`, or similar functions you may observe this error and you should handle it in that context. This occurred at route "${route}".`
    )
  }
}

const CLIENT_HOOK_DYNAMIC = 'CLIENT_HOOK_DYNAMIC'

export class ClientHookDynamicError extends Error {
  public readonly digest = CLIENT_HOOK_DYNAMIC

  constructor(route: string, expression: string) {
    super(
      `Route "${route}": Next.js encountered URL data \`${expression}\` in a Client Component outside of \`<Suspense>\`.\n\n` +
        `This blocks prerendering because the value is only available at runtime.\n\n` +
        `Ways to fix this:\n` +
        `  - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering\n` +
        `  - [block] Set \`export const instant = false\` to allow a blocking route\n\n` +
        `Learn more: https://nextjs.org/docs/messages/blocking-prerender-client-hook`
    )
  }
}

export function isClientHookDynamicError(
  err: unknown
): err is ClientHookDynamicError {
  if (typeof err !== 'object' || err === null || !('digest' in err)) {
    return false
  }

  return err.digest === CLIENT_HOOK_DYNAMIC
}

type AbortListeners = Array<() => void>
const abortListenersBySignal = new WeakMap<AbortSignal, AbortListeners>()

/**
 * Constructs a promise that never resolves, standing in for *dynamic* data:
 * data that is only available during a real dynamic request and hangs in
 * every kind of prerender — `io()`, `connection()`, uncached `fetch()`.
 *
 * This is primarily useful for cacheComponents where we use promise
 * resolution timing to determine which parts of a render can be included in a
 * prerender.
 *
 * Records nothing on the prerender store: the promise's holes are only ever
 * filled by a real dynamic request, so a runtime prefetch response would have
 * the same holes as the static one. If the data source would resolve during a
 * runtime prerender, use `makeRuntimeHangingPromise` instead.
 */
export function makeDynamicHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string
): Promise<T> {
  return makeHangingPromiseWithError(
    signal,
    new HangingPromiseRejectionError(route, expression)
  )
}

export function makeUntrackedHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string
): Promise<T> {
  return makeHangingPromiseWithError(
    signal,
    new HangingPromiseRejectionError(route, expression)
  )
}

/**
 * Constructs a promise that never resolves, standing in for session data
 * (which a runtime shell can access).
 * Examples: cookies, headers
 *
 * Awaiting one of these during a static prerender records on the prerender
 * store that a runtime shell would produce more content than the static
 * static shell, which the segment prefetch encoding uses
 * to tell the client whether a runtime request could be skipped.
 *
 * When unsure whether data is dynamic or runtime, prefer this method — the
 * cost of over-recording is a redundant runtime prefetch request; the cost of
 * under-recording is a permanently missing one.
 *
 * For fallback-param data — data a concrete (ISR-upgraded) prerender would
 * resolve — use `makeFallbackParamsHangingPromise` instead, so the access
 * is recorded with the right effect on the static-prefetch hint.
 */
export function makeSessionDataHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string,
  workUnitStore: WorkUnitStore
): Promise<T> {
  const promise = makeHangingPromiseWithError<T>(
    signal,
    new HangingPromiseRejectionError(route, expression)
  )
  return trackPromiseUsed(
    promise,
    trackSessionDataAccessed.bind(null, workUnitStore, expression)
  )
}

/**
 * Constructs a promise that never resolves, standing in for URL data,
 * which can be accessed in a runtime prefetch (but not a runtime shell).
 * Examples: fallback params, searchParams
 *
 * Awaiting one of these during a static prerender records on the prerender
 * store that a runtime prefetch would produce more content than the static
 * response, which the segment prefetch encoding uses
 * to tell the client whether a runtime prefetch request could be skipped.
 *
 * When unsure whether data is dynamic or runtime, prefer this method — the
 * cost of over-recording is a redundant runtime prefetch request; the cost of
 * under-recording is a permanently missing one.
 *
 * `workUnitStore` may be null ONLY when the caller tracks the access itself.
 * Such a caller MUST call `trackURLDataAccessed` from every path that
 * observes the promise (e.g. the proxy traps for `then`/`status`),
 * against the work unit store active at access time.
 *
 * For fallback-param data — data a concrete (ISR-upgraded) prerender would
 * resolve — use `makeFallbackParamsHangingPromise` instead, so the access
 * is recorded with the right effect on the static-prefetch hint.
 */
export function makeURLDataHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string,
  workUnitStore: WorkUnitStore | null
): Promise<T> {
  const promise = makeHangingPromiseWithError<T>(
    signal,
    new HangingPromiseRejectionError(route, expression)
  )
  if (workUnitStore === null) {
    return promise
  }
  return trackPromiseUsed(
    promise,
    trackURLDataAccessed.bind(null, workUnitStore, expression)
  )
}

/**
 * Creates a promise that stands in for data that is only available in a prefetch, but not in a shell.
 * It does not need to semantically be URL data like params or searchParams.
 */
export function makePrefetchDataHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string,
  workUnitStore: WorkUnitStore
): Promise<T> {
  // Accessing this data should only affect the prefetch, not the shell.
  return makeURLDataHangingPromise(signal, route, expression, workUnitStore)
}

/**
 * Creates a promise that stands in for a result that will either be session data
 * or URL data, but we don't know which.
 */
export function makeUnknownRuntimeDataHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string,
  workUnitStore: WorkUnitStore
): Promise<T> {
  // We don't know if this is session or URL data, i.e. if it should affect the shell
  // or only the prefetch. Track it conservatively as affecting both.
  return makeSessionDataHangingPromise(signal, route, expression, workUnitStore)
}

/**
 * Variant of `makeRuntimeHangingPromise` for *fallback-param* data: fallback
 * route params and values derived solely from them (`params`, `rootParams`,
 * `pathname` during a fallback prerender). Like every runtime data access,
 * awaiting it records the access on the prerender store's response-level flag,
 * but its effect on the build-time static-prefetch hint differs — on a
 * fallback-upgradeable route the access is transient (a concrete prerender
 * resolves it), so it leaves the hint intact. See `trackFallbackParamsAccessed`.
 *
 * As with `makeRuntimeHangingPromise`, `workUnitStore` may be null ONLY when
 * the caller tracks the access itself by calling `trackFallbackParamsAccessed`
 * from every path that observes the promise.
 */
export function makeFallbackParamsHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string,
  workUnitStore: WorkUnitStore | null
): Promise<T> {
  const promise = makeHangingPromiseWithError<T>(
    signal,
    new HangingPromiseRejectionError(route, expression)
  )
  if (workUnitStore === null) {
    return promise
  }
  return trackPromiseUsed(
    promise,
    trackFallbackParamsAccessed.bind(null, workUnitStore, expression)
  )
}

export type PrerenderDataTracking = {
  /**
   * Records when the render has accessed a request data source
   * that hangs during a static prerender but would resolve during a runtime
   * prerender — cookies, headers, fallback params, searchParams, and cache
   * entries excluded only from static prerenders.
   *
   * The client uses this promise as the actual source of truth for whether a segment
   * needs a runtime request. Prefetch hints can become stale after a revalidation,
   * so if a hint says a static request should be enough but `runtimeDataAccessed`
   * resolves to `true`, a follow-up runtime request will be issued.
   * This applies to both shells and prefetches.
   *
   * The promise is embedded in the RSC payload (`InitialRSCPayload['u']`),
   * and is meant to be rewindable. This means that the shell might not have
   * any runtime data accesses, even when the prefetch does.
   * (this has some subtleties; see `markRuntimeDataAccessWhenStageReached`
   * for more)
   *
   * After the prerender, the promise is consumed by `collectSegmentData` and each
   * static prefetch will contain it (`PrefetchFlightResponse['u']`).
   * However, all the segments for a route will use the same promise (because we're
   * only tracking this on the page level) so if one segment needs runtime data, then
   * all segments will be marked as such.
   * However, on the client `isPartial` takes precedence over `runtimeDataAccessed`,
   * so complete segments will not end up being deopted.
   */
  readonly runtimeDataAccessed: PromiseWithResolvers<boolean>

  /** Corresponds to `PrefetchHint.ShouldAttemptStaticShell`. */
  shouldAttemptStaticShell: boolean
  /** Corresponds to `PrefetchHint.ShouldAttemptStaticPrefetch`. */
  shouldAttemptStaticPrefetch: boolean
}

export function createPrerenderDataTracking(): PrerenderDataTracking {
  return {
    runtimeDataAccessed: createPromiseWithResolvers(),
    shouldAttemptStaticShell: true,
    shouldAttemptStaticPrefetch: true,
  }
}

export function finishPrerenderDataTracking(
  prerenderDataTracking: PrerenderDataTracking
) {
  // If a runtime data access already resolved this promise, this is a no-op.
  prerenderDataTracking.runtimeDataAccessed.resolve(false)
}

function trackSessionDataAccessed(
  workUnitStore: WorkUnitStore,
  expression: string
): void {
  trackRuntimeDataAccessed(
    workUnitStore,
    PrerenderDataKind.SessionData,
    expression
  )
}

/**
 * Records on a static prerender store that the render accessed a data source
 * which would have resolved during a runtime prefetch (but NOT in a runtime shell)
 *  No-op for all other store types.
 *
 * Prefer `makeRuntimeHangingPromise` and `makeStageHangingPromise`.
 * Use this method only when implementing similar tracking and those two are not enough.
 *
 * For fallback-param data, use `trackFallbackParamsAccessed` instead. When
 * unsure, this is the conservative choice.
 */
export function trackURLDataAccessed(
  workUnitStore: WorkUnitStore,
  expression: string
): void {
  trackRuntimeDataAccessed(workUnitStore, PrerenderDataKind.UrlData, expression)
}

/**
 * Fallback-param variant of `trackRuntimeDataAccessed`, for accesses of
 * fallback route params and values derived solely from them. It records the
 * response-level flag all the same, but only clears the build-time
 * static-prefetch hint when the route is not fallback-upgradeable — on an
 * upgradeable route the access is transient, since ISR later produces a
 * concrete prerender that resolves it.
 */
export function trackFallbackParamsAccessed(
  workUnitStore: WorkUnitStore,
  expression: string
): void {
  trackRuntimeDataAccessed(
    workUnitStore,
    PrerenderDataKind.FallbackParams,
    expression
  )
}

const enum PrerenderDataKind {
  SessionData = 1,
  UrlData = 2,
  FallbackParams = 3,
}

function trackRuntimeDataAccessed(
  workUnitStore: WorkUnitStore,
  dataKind: PrerenderDataKind,
  expression: string
): void {
  switch (workUnitStore.type) {
    case 'prerender': {
      const { prerenderDataTracking, stagedRendering } = workUnitStore
      if (!prerenderDataTracking || !stagedRendering) {
        return
      }
      const { currentStage } = stagedRendering
      if (currentStage === RenderStage.Before) {
        console.error(
          new InvariantError(
            'Unexpected trackRuntimeDataAccessed in the Before stage.'
          )
        )
        return
      }
      if (currentStage >= RenderStage.NavigationStatic) {
        // Ignore any accesses that happen after `navigation()` resolves.
        // The purpose of this tracking is to judge whether a runtime prefetch
        // would give us a more complete result than a static one.
        // But `navigation()` wouldn't have resolved in a runtime prefetch,
        // so e.g. `await navigation(); await cookies()` wouldn't have more content
        // in those, and we shouldn't count it.
        return
      }

      switch (dataKind) {
        case PrerenderDataKind.SessionData: {
          // Potentially deopt both the shell and the prefetch,
          // because if the shell accessed runtime data, so does the prefetch.
          // However, if we're already past the shell stage, the shell is not affected.
          // (which makes e.g. `await prefetch(); await cookies()` only affect the prefetch)
          let firstAffectedStage:
            | RenderStage.ShellStatic
            | RenderStage.PrefetchStatic
            | null = null

          if (currentStage <= RenderStage.ShellStatic) {
            prerenderDataTracking.shouldAttemptStaticShell = false
            logRuntimeDeopt?.(expression, 'shell')
            firstAffectedStage ??= RenderStage.ShellStatic
          }

          if (currentStage <= RenderStage.PrefetchStatic) {
            prerenderDataTracking.shouldAttemptStaticPrefetch = false
            logRuntimeDeopt?.(expression, 'prefetch')
            // NOTE: if the shell is affected, don't override it.
            firstAffectedStage ??= RenderStage.PrefetchStatic
          }

          if (firstAffectedStage !== null) {
            markRuntimeDataAccessWhenStageReached(
              prerenderDataTracking,
              stagedRendering,
              firstAffectedStage
            )
          }
          break
        }
        case PrerenderDataKind.FallbackParams: {
          if (workUnitStore.isFallbackUpgradeable) {
            // A fallback-param access is transient when the route is
            // fallback-upgradeable (i.e. ISR later produces the concrete prerender a
            // static prefetch would hit) so it does not indicate the need
            // for a runtime request.
            // We don't
            // (Until that upgrade, the response-level flag keeps directing
            // the client to a runtime fallback; the hint only costs a wasted
            // static attempt in the interim.
            //
            // TODO(prerender-data-tracking): is this correctly handling the case where
            // only some of the params are upgradeable?

            markRuntimeDataAccessWhenStageReached(
              prerenderDataTracking,
              stagedRendering,
              RenderStage.PrefetchStatic
            )
            break
          }
          // not an upgradeable fallback param access, so we treat it as URL data.
          // intentional fallthrough
        }
        case PrerenderDataKind.UrlData: {
          // Only deopt the prefetch, not the shell, which cannot access URL data anyway.
          if (currentStage <= RenderStage.PrefetchStatic) {
            prerenderDataTracking.shouldAttemptStaticPrefetch = false
            logRuntimeDeopt?.(expression, 'prefetch')

            markRuntimeDataAccessWhenStageReached(
              prerenderDataTracking,
              stagedRendering,
              RenderStage.PrefetchStatic
            )
          }

          break
        }
      }

      break
    }
    case 'prerender-client':
    case 'prerender-legacy':
    case 'prerender-runtime':
    case 'validation-client':
    case 'request':
    case 'cache':
    case 'private-cache':
    case 'unstable-cache':
    case 'generate-static-params':
      // Only the modern server prerender tracks this; see the field docs on
      // PrerenderStoreModernServer.
      break
    default:
      workUnitStore satisfies never
  }
}

/**
 * Tracks a runtime data access on the `runtimeDataAccessed` promise,
 * but with a delay until `targetStage`.
 *
 * When we encounter a URL data access like `await params`, we need to mark the
 * *prefetch* as needing runtime data, but the *shell* should remain unaffected
 * (because it cannot access params anyway).
 *
 * However, the shell and the prefetch share one `runtimeDataAccessed` promise,
 * and it needs to be accurately rewindable by the client
 * In other words, we need to make sure that it reads as `false` when rewound
 * to a shell, but as `true` in the final response (the prefetch).
 *
 * This means that if the `await params` is encountered during the shell stage, we
 * cannot resolve `runtimeDataAccessed` immediately.
 * Instead, we delay the resolution until the PrefetchStatic stage, so the promise
 * will remain unresolved when rewound to the shell stage (which reads as `false`).
 */
function markRuntimeDataAccessWhenStageReached(
  prerenderDataTracking: PrerenderDataTracking,
  stageController: StagedRenderingController,
  targetStage: AdvanceableRenderStage
) {
  const { runtimeDataAccessed } = prerenderDataTracking
  // NOTE: If we're already in or past the target stage, we can avoid allocating a closure,
  // because `onStage` would've executed the callback immediately anyway.
  if (stageController.currentStage >= targetStage) {
    runtimeDataAccessed.resolve(true)
  } else {
    stageController.onStage(
      targetStage,
      runtimeDataAccessed.resolve.bind(null, true)
    )
  }
}

const logRuntimeDeopt = process.env.NEXT_PRIVATE_DEBUG_RUNTIME_DATA
  ? (expression: string, kind: 'shell' | 'prefetch') => {
      const { route } = workAsyncStorage.getStore()!
      console.log(
        `Route '${route}' deopting to a runtime ${kind} because it used ${expression}`
      )
    }
  : undefined

export function trackIncompatibleShellContent(workUnitStore: RequestStore) {
  workUnitStore.hasIncompatibleShellContent = true
}

export function makeClientHookHangingPromise<T>(
  signal: AbortSignal,
  error: ClientHookDynamicError
): Promise<T> {
  return makeHangingPromiseWithError(signal, error)
}

function makeHangingPromiseWithError<T>(
  signal: AbortSignal,
  error: Error
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(error)
  } else {
    const hangingPromise = new Promise<T>((_, reject) => {
      const boundRejection = reject.bind(null, error)
      let currentListeners = abortListenersBySignal.get(signal)
      if (currentListeners) {
        currentListeners.push(boundRejection)
      } else {
        const listeners = [boundRejection]
        abortListenersBySignal.set(signal, listeners)
        signal.addEventListener(
          'abort',
          () => {
            for (let i = 0; i < listeners.length; i++) {
              listeners[i]()
            }
          },
          { once: true }
        )
      }
    })
    // We are fine if no one actually awaits this promise. We shouldn't consider this an unhandled rejection so
    // we attach a noop catch handler here to suppress this warning. If you actually await somewhere or construct
    // your own promise out of it you'll need to ensure you handle the error when it rejects.
    hangingPromise.catch(ignoreReject)
    return hangingPromise
  }
}

function ignoreReject() {}

/**
 * Creates a promise that will be triggered when another promise resolves.
 * It will not emit unhandled rejections, which is important if the trigger
 * is a promise that might itself get rejected (e.g. when a prerender/render
 * are aborted due to sync IO)
 */
export function makePromiseFromTrigger<T>(
  trigger: Promise<any>,
  value: T
): Promise<T> {
  const promise = trigger.then(() => value)
  promise.catch(ignoreReject)
  return promise
}

export function makeDevtoolsIOAwarePromise<T>(
  underlying: T,
  requestStore: RequestStore,
  stage: AdvanceableRenderStage
): Promise<T> {
  if (requestStore.stagedRendering) {
    // We resolve each stage in a timeout, so React DevTools will pick this up as IO.
    return requestStore.stagedRendering.delayUntilStage(
      stage,
      undefined,
      underlying
    )
  }
  // in React DevTools if we resolve in a setTimeout we will observe
  // the promise resolution as something that can suspend a boundary or root.
  return new Promise<T>((resolve) => {
    // Must use setTimeout to be considered IO React DevTools. setImmediate will not work.
    setTimeout(() => {
      resolve(underlying)
    }, 0)
  })
}

/**
 * Invokes `onUse` whenever `then()/catch()/finally()` are called on the promise
 * or when the promise is awaited. */
export function trackPromiseUsed<T>(
  promise: Promise<T>,
  onUse: () => void
): Promise<T> {
  // We can instrument `.then()/.catch()/.finally()` in one go by using a Promise subclass
  // that implements a custom `.then()`, because `catch` and `finally` delegate to it.
  //
  // Alternative implementation ideas that were tried and rejected:
  //
  // 1. Patching the methods directly via `promise.then = (..args) => { ... }`:
  //   doesn't work, because Node does not call the monkeypatched methods for native `await`:
  //   > Native Promise [...]: The promise is directly used and awaited natively, without calling `then()`.
  //   > https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/await#description
  //
  // 2. Wrapping in a proxy that returns a custom `then/catch/finally`:
  //   breaks async stacks in React's IO tracking (stack becomes `Promise.then`)
  return TrackedPromise.from<T>(promise, onUse)
}

class TrackedPromise<T> extends Promise<T> {
  #onUse: (() => void) | null = null

  // We don't need derived promises to also be a TrackedPromise.
  // We only care about the first level of `.then()`.
  static get [Symbol.species]() {
    return Promise
  }

  static from<T>(promise: Promise<T>, onUse: () => void): TrackedPromise<T> {
    // Whenever the promise we're tracking resolves/rejects, we should follow.
    const tracked = new TrackedPromise<T>(promise.then.bind(promise))

    tracked.#onUse = onUse

    // Hanging promises catch rejections when created. Tracked promises are generally derived
    // from promises that may hang & reject, so we need to do the same.
    // However, we have to bypass the tracking we do in `TrackedPromise.then`.
    // (we're using `then` directly, because `catch` ends up delegating `TrackedPromise.then`)
    Promise.prototype.then.call(tracked, undefined, ignoreReject)

    return tracked
  }

  then<TResult1, TResult2>(
    onFulfilled?: (value: T) => TResult1 | PromiseLike<TResult1>,
    onRejected?: (reason: unknown) => TResult2 | PromiseLike<TResult2>
  ): Promise<TResult1 | TResult2> {
    const onUse = this.#onUse
    if (onUse) {
      try {
        onUse()
      } catch (err) {
        // We don't want to break the method even if our tracking errored.
        console.error(err)
      }
    }

    return Promise.prototype.then.call(
      this,
      onFulfilled,
      onRejected
    ) as Promise<TResult1 | TResult2>
  }
}

export const RENDER_STAGES_BY_DATA_KIND = {
  sessionData: RenderStage.ShellRuntime as const,
  staticLinkData: RenderStage.PrefetchStatic as const,
  runtimeLinkData: RenderStage.Runtime as const,
}

export function applyOwnerStack(error: Error): Error {
  if (process.env.NODE_ENV !== 'production') {
    let ownerStack: string | undefined | null
    const workUnitStore = workUnitAsyncStorage.getStore()

    // captureOwnerStack() returns the owner stack for the current React
    // rendering context. Inside a cache scope this only includes the inner
    // component tree. The outer owner stack (captured before entering the
    // cache boundary in use-cache-wrapper.ts) is stored on the cache store.
    // We concatenate both to get the full component tree.
    const innerOwnerStack =
      getClientReact()?.captureOwnerStack?.() ??
      getServerReact()?.captureOwnerStack?.()

    switch (workUnitStore?.type) {
      case 'cache':
      case 'private-cache':
        ownerStack =
          (innerOwnerStack || '') + (workUnitStore.outerOwnerStack || '') ||
          undefined
        break
      case 'unstable-cache':
      case 'request':
      case 'prerender':
      case 'prerender-legacy':
      case 'prerender-runtime':
      case 'prerender-client':
      case 'validation-client':
      case 'generate-static-params':
      case undefined:
        ownerStack = innerOwnerStack
        break
      default:
        workUnitStore satisfies never
    }

    if (ownerStack) {
      let stack = ownerStack

      if (error.stack) {
        const frames: string[] = []

        for (const frame of error.stack.split('\n').slice(1)) {
          if (frame.includes('react_stack_bottom_frame')) {
            break
          }

          frames.push(frame)
        }

        stack = '\n' + frames.join('\n') + stack
      }

      error.stack = error.name + ': ' + error.message + stack
    }
  }

  return error
}
