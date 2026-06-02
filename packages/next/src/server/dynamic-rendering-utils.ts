import { InvariantError } from '../shared/lib/invariant-error'
import {
  RenderStage,
  type AdvanceableRenderStage,
  type StagedRenderingController,
  isEarlyRenderStage,
} from './app-render/staged-rendering'
import type {
  PrerenderStoreModernRuntime,
  RequestStore,
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

type AbortListeners = Array<(err: unknown) => void>
const abortListenersBySignal = new WeakMap<AbortSignal, AbortListeners>()

/**
 * This function constructs a promise that will never resolve. This is primarily
 * useful for cacheComponents where we use promise resolution timing to determine which
 * parts of a render can be included in a prerender.
 *
 * @internal
 */
export function makeHangingPromise<T>(
  signal: AbortSignal,
  route: string,
  expression: string
): Promise<T> {
  if (signal.aborted) {
    return Promise.reject(new HangingPromiseRejectionError(route, expression))
  } else {
    const hangingPromise = new Promise<T>((_, reject) => {
      const boundRejection = reject.bind(
        null,
        new HangingPromiseRejectionError(route, expression)
      )
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
 * Returns the appropriate runtime stage for the current point in the render.
 * Runtime-prefetchable segments render in the early stages and should wait
 * for EarlyRuntime. Non-prefetchable segments render in the later stages
 * and should wait for Runtime.
 */
export function getRuntimeStage(
  stagedRendering: StagedRenderingController
): RenderStage.EarlyRuntime | RenderStage.Runtime {
  const { currentStage } = stagedRendering
  if (currentStage === RenderStage.Before) {
    throw new InvariantError(
      'Cannot determine late/early stage before starting the render'
    )
  }
  return isEarlyRenderStage(currentStage)
    ? RenderStage.EarlyRuntime
    : RenderStage.Runtime
}

/**
 * Delays until the appropriate runtime stage based on the current stage of
 * the rendering pipeline:
 *
 * - Early stages → wait for EarlyRuntime
 *   (for runtime-prefetchable segments)
 * - Later stages → wait for Runtime
 *   (for segments not using runtime prefetch)
 *
 * This ensures that cookies()/headers()/etc. resolve at the right time for
 * each segment type.
 */
export function delayUntilRuntimeStage<T>(
  prerenderStore: PrerenderStoreModernRuntime,
  result: Promise<T>
): Promise<T> {
  const { stagedRendering } = prerenderStore
  if (!stagedRendering) {
    return result
  }
  return stagedRendering
    .waitForStage(getRuntimeStage(stagedRendering))
    .then(() => result)
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
