import {
  RenderStage,
  type AdvanceableRenderStage,
} from './app-render/staged-rendering'
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
 *
 * @internal
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
 * Constructs a promise that never resolves, standing in for *runtime* data:
 * data that hangs during a static prerender but is available during a runtime
 * prerender (the kind that backs a runtime prefetch request: request data
 * like cookies and headers is available, but the render is still not a real
 * dynamic request). Examples: cookies, headers, fallback params,
 * searchParams, and cache entries that are excluded only from static
 * prerenders.
 *
 * Creating one of these during a static prerender records on the prerender
 * store that a runtime prefetch would produce more content than the static
 * response (`runtimeDataAccessed`), which the segment prefetch encoding uses
 * to tell the client whether a runtime prefetch request could be skipped.
 *
 * When unsure whether data is dynamic or runtime, prefer this method — the
 * cost of over-recording is a redundant runtime prefetch request; the cost of
 * under-recording is a permanently missing one.
 *
 * `workUnitStore` may be null ONLY when the caller tracks the access itself
 * at observation time instead of creation time. This is for promises the
 * framework creates eagerly whether or not anything reads them (e.g. the
 * `searchParams` prop constructed for every page): recording at creation
 * would mark every render. Such a caller MUST call `trackRuntimeDataAccessed`
 * from every path that observes the promise (e.g. the proxy traps for
 * `then`/`status`), against the work unit store active at access time.
 *
 * For fallback-param data — data a concrete (ISR-upgraded) prerender would
 * resolve — use `makeFallbackParamsHangingPromise` instead, so the access
 * is recorded with the right effect on the static-prefetch hint.
 *
 * @internal
 */
export function makeRuntimeHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string,
  workUnitStore: WorkUnitStore | null
): Promise<T> {
  if (workUnitStore !== null) {
    trackRuntimeDataAccessed(workUnitStore)
  }
  return makeHangingPromiseWithError(
    signal,
    new HangingPromiseRejectionError(route, expression)
  )
}

/**
 * Variant of `makeRuntimeHangingPromise` for *fallback-param* data: fallback
 * route params and values derived solely from them (`params`, `rootParams`,
 * `pathname` during a fallback prerender). Like every runtime data access it
 * records the access on the prerender store's response-level flag, but its
 * effect on the build-time static-prefetch hint differs — on a
 * fallback-upgradeable route the access is transient (a concrete prerender
 * resolves it), so it leaves the hint intact. See
 * `trackFallbackParamsAccessed`.
 *
 * As with `makeRuntimeHangingPromise`, `workUnitStore` may be null ONLY when
 * the caller tracks the access itself at observation time instead of creation
 * time, by calling `trackFallbackParamsAccessed` from every path that
 * observes the promise.
 *
 * @internal
 */
export function makeFallbackParamsHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string,
  workUnitStore: WorkUnitStore | null
): Promise<T> {
  if (workUnitStore !== null) {
    trackFallbackParamsAccessed(workUnitStore)
  }
  return makeHangingPromiseWithError(
    signal,
    new HangingPromiseRejectionError(route, expression)
  )
}

/**
 * Constructs a promise that never resolves, standing in for data that is only
 * accessible in a later *stage* of rendering than this render reaches — e.g.
 * a prefetchable short-stale cache entry that's excluded from shells when the
 * render ends at the shell stage, or params during a runtime-prefetch render
 * that stops before the stage where params resolve.
 *
 * A render that runs through the later stage would include the data; in
 * particular a runtime prefetch renders through its later stages, so on a
 * static prerender store this records `runtimeDataAccessed`, same as
 * `makeRuntimeHangingPromise`.
 *
 * @internal
 */
export function makeStageHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string,
  workUnitStore: WorkUnitStore
): Promise<T> {
  trackRuntimeDataAccessed(workUnitStore)
  return makeHangingPromiseWithError(
    signal,
    new HangingPromiseRejectionError(route, expression)
  )
}

/**
 * Records on a static prerender store that the render accessed a data source
 * which would have resolved during a runtime prerender. No-op for all other
 * store types.
 *
 * `makeRuntimeHangingPromise` and `makeStageHangingPromise` call this
 * automatically; call it directly only where the access is observed
 * separately from the promise's creation (see the null `workUnitStore` case
 * of `makeRuntimeHangingPromise`), or where the prerender is aborted
 * synchronously instead of hanging.
 *
 * For fallback-param data, use `trackFallbackParamsAccessed` instead. When
 * unsure, this is the conservative choice: it unconditionally clears the
 * static-prefetch hint.
 */
export function trackRuntimeDataAccessed(workUnitStore: WorkUnitStore): void {
  trackRuntimeDataAccessedImpl(workUnitStore, false)
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
  workUnitStore: WorkUnitStore
): void {
  trackRuntimeDataAccessedImpl(workUnitStore, true)
}

function trackRuntimeDataAccessedImpl(
  workUnitStore: WorkUnitStore,
  isFallbackParamAccess: boolean
): void {
  switch (workUnitStore.type) {
    case 'prerender': {
      // Response-level flag (the payload's `u`, forwarded to segment
      // responses as `needsRuntimeRequest`): resolved for every kind of
      // access — a pre-upgrade fallback response must keep reporting that
      // a runtime request would return more. The fulfillment row lands at
      // the current position in the Flight stream, which is what makes the
      // value rewindable per stage. Promise resolution is idempotent, so
      // repeated accesses are free.
      workUnitStore.runtimeDataAccessed?.resolve(true)

      // Hint cell (holds the build-constant
      // PrefetchHint.ShouldAttemptStaticPrefetch value directly): a
      // fallback-param access is transient when the route is
      // fallback-upgradeable — ISR later produces the concrete prerender a
      // static prefetch attempt would hit — so it leaves the hint intact.
      // (Until that upgrade, the response-level flag above keeps directing
      // the client to a runtime fallback; the hint only costs a wasted
      // static attempt in the interim.) Every other access clears it.
      const hintCell = workUnitStore.shouldAttemptStaticPrefetch
      if (
        hintCell !== null &&
        (!isFallbackParamAccess || !workUnitStore.isFallbackUpgradeable)
      ) {
        hintCell.current = false
      }
      break
    }
    case 'prerender-client':
    case 'prerender-ppr':
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

export const RENDER_STAGES_BY_DATA_KIND = {
  sessionData: RenderStage.ShellRuntime as const,
  staticLinkData: RenderStage.Static as const,
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
      case 'prerender-ppr':
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
