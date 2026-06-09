import { InvariantError } from '../shared/lib/invariant-error'
import {
  isEarlyRenderStage,
  RenderStage,
  type AdvanceableRenderStage,
  type StagedRenderingController,
} from './app-render/staged-rendering'
import type { RequestStore } from './app-render/work-unit-async-storage.external'
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
        `    https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense\n` +
        `  - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route\n` +
        `    https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route`
    )
  }
}

export class ParamClientHookDynamicError extends Error {
  public readonly digest = CLIENT_HOOK_DYNAMIC

  constructor(route: string, expression: string) {
    const cacheBullet =
      expression === 'useParams()'
        ? `  - [cache] For known params, prerender them with \`generateStaticParams\`\n` +
          `    https://nextjs.org/docs/messages/blocking-prerender-client-hook#for-known-params-prerender\n`
        : ''
    super(
      `Route "${route}": Next.js encountered URL data \`${expression}\` in a Client Component outside of \`<Suspense>\`.\n\n` +
        `This blocks prerendering because the value is only available at runtime.\n\n` +
        `Ways to fix this:\n` +
        `  - [stream] Wrap the component in \`<Suspense fallback={...}>\` so the hook value streams in after prerendering\n` +
        `    https://nextjs.org/docs/messages/blocking-prerender-client-hook#wrap-in-or-move-into-suspense\n` +
        cacheBullet +
        `  - [block] Set \`export const unstable_instant = false\` to silence this warning and allow a blocking route\n` +
        `    https://nextjs.org/docs/messages/blocking-prerender-client-hook#allow-blocking-route`
    )
  }
}

export function isClientHookDynamicError(
  err: unknown
): err is ClientHookDynamicError | ParamClientHookDynamicError {
  if (typeof err !== 'object' || err === null || !('digest' in err)) {
    return false
  }

  return err.digest === CLIENT_HOOK_DYNAMIC
}

type AbortListeners = Array<() => void>
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
  return makeHangingPromiseWithError(
    signal,
    new HangingPromiseRejectionError(route, expression)
  )
}

export function makeClientHookHangingPromise<T>(
  signal: AbortSignal,
  error: ClientHookDynamicError | ParamClientHookDynamicError
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
  // NOTE: keep in sync with getSessionDataStage
  sessionData: {
    early: RenderStage.ShellEarlyRuntime as const,
    late: RenderStage.ShellRuntime as const,
  },
  // NOTE: keep in sync with getStaticLinkDataStage
  staticLinkData: {
    early: RenderStage.EarlyStatic as const,
    late: RenderStage.Static as const,
  },
  // NOTE: keep in sync with getRuntimeLinkDataStage
  runtimeLinkData: {
    early: RenderStage.EarlyRuntime as const,
    late: RenderStage.Runtime as const,
  },
}

export function getSessionDataStage(
  stagedRendering: StagedRenderingController
) {
  const { currentStage } = stagedRendering
  if (currentStage === RenderStage.Before) {
    throw new InvariantError(
      'Cannot determine late/early stage before starting the render'
    )
  }
  // NOTE: keep in sync with RENDER_STAGES_BY_DATA_KIND
  return isEarlyRenderStage(currentStage)
    ? RenderStage.ShellEarlyRuntime
    : RenderStage.ShellRuntime
}

export function getStaticLinkDataStage(
  stagedRendering: StagedRenderingController
) {
  const { currentStage } = stagedRendering
  if (currentStage === RenderStage.Before) {
    throw new InvariantError(
      'Cannot determine late/early stage before starting the render'
    )
  }
  // NOTE: keep in sync with RENDER_STAGES_BY_DATA_KIND
  return isEarlyRenderStage(currentStage)
    ? RenderStage.EarlyStatic
    : RenderStage.Static
}

export function getRuntimeLinkDataStage(
  stagedRendering: StagedRenderingController
) {
  const { currentStage } = stagedRendering
  if (currentStage === RenderStage.Before) {
    throw new InvariantError(
      'Cannot determine late/early stage before starting the render'
    )
  }
  // NOTE: keep in sync with RENDER_STAGES_BY_DATA_KIND
  return isEarlyRenderStage(currentStage)
    ? RenderStage.EarlyRuntime
    : RenderStage.Runtime
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
