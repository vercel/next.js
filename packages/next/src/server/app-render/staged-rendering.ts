import { InvariantError } from '../../shared/lib/invariant-error'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'

export enum RenderStage {
  Before = 1,
  EarlyStatic = 2,
  Static = 3,
  EarlyRuntime = 4,
  Runtime = 5,
  Dynamic = 6,
  Abandoned = 7,
}

export type AdvanceableRenderStage =
  | RenderStage.Static
  | RenderStage.EarlyRuntime
  | RenderStage.Runtime
  | RenderStage.Dynamic

export class StagedRenderingController {
  currentStage: RenderStage = RenderStage.Before

  syncInterruptReason: Error | null = null
  staticStageEndTime: number = Infinity
  runtimeStageEndTime: number = Infinity

  private staticStageListeners: Array<() => void> = []
  private earlyRuntimeStageListeners: Array<() => void> = []
  private runtimeStageListeners: Array<() => void> = []
  private dynamicStageListeners: Array<() => void> = []

  private staticStagePromise = createPromiseWithResolvers<void>()
  private earlyRuntimeStagePromise = createPromiseWithResolvers<void>()
  private runtimeStagePromise = createPromiseWithResolvers<void>()
  private dynamicStagePromise = createPromiseWithResolvers<void>()

  constructor(
    private abortSignal: AbortSignal | null = null,
    private abandonController: AbortController | null = null
  ) {
    if (abortSignal) {
      abortSignal.addEventListener(
        'abort',
        () => {
          // Reject all stage promises that haven't already been resolved.
          // If a promise was already resolved via advanceStage, the reject
          // is a no-op. The ignoreReject handler suppresses unhandled
          // rejection warnings for promises that no one is awaiting.
          const { reason } = abortSignal
          this.staticStagePromise.promise.catch(ignoreReject)
          this.staticStagePromise.reject(reason)
          this.earlyRuntimeStagePromise.promise.catch(ignoreReject)
          this.earlyRuntimeStagePromise.reject(reason)
          this.runtimeStagePromise.promise.catch(ignoreReject)
          this.runtimeStagePromise.reject(reason)
          this.dynamicStagePromise.promise.catch(ignoreReject)
          this.dynamicStagePromise.reject(reason)
        },
        { once: true }
      )
    }

    if (abandonController) {
      abandonController.signal.addEventListener(
        'abort',
        () => {
          this.abandonRender()
        },
        { once: true }
      )
    }
  }

  onStage(stage: AdvanceableRenderStage, callback: () => void) {
    if (this.currentStage >= stage) {
      callback()
    } else if (stage === RenderStage.Static) {
      this.staticStageListeners.push(callback)
    } else if (stage === RenderStage.EarlyRuntime) {
      this.earlyRuntimeStageListeners.push(callback)
    } else if (stage === RenderStage.Runtime) {
      this.runtimeStageListeners.push(callback)
    } else if (stage === RenderStage.Dynamic) {
      this.dynamicStageListeners.push(callback)
    } else {
      // This should never happen
      throw new InvariantError(`Invalid render stage: ${stage}`)
    }
  }

  canSyncInterrupt() {
    // If we haven't started the render yet, it can't be interrupted.
    if (this.currentStage === RenderStage.Before) {
      return false
    }

    switch (this.currentStage) {
      case RenderStage.EarlyStatic:
      case RenderStage.Static:
        return true
      case RenderStage.EarlyRuntime:
        // EarlyRuntime is for runtime-prefetchable segments. Sync IO
        // should error because it would abort a runtime prefetch.
        return true
      case RenderStage.Runtime:
        // Runtime is for non-prefetchable segments. Sync IO is fine there
        // because in practice this segment will never be runtime prefetched
        return false
      case RenderStage.Dynamic:
      case RenderStage.Abandoned:
        return false
      default:
        return false
    }
  }

  syncInterruptCurrentStageWithReason(reason: Error) {
    if (this.currentStage === RenderStage.Before) {
      return
    }

    // If the render has already been abandoned, there's nothing to interrupt.
    if (this.currentStage === RenderStage.Abandoned) {
      return
    }

    // If Sync IO occurs during an abandonable render, we trigger the abandon.
    // The abandon listener will call abandonRender which advances through
    // stages to let caches fill before marking as Abandoned.
    if (this.abandonController) {
      this.abandonController.abort()
      return
    }

    // If we're in the final render, we cannot abandon it. We need to advance to the Dynamic stage
    // and capture the interruption reason.
    switch (this.currentStage) {
      case RenderStage.EarlyStatic:
      case RenderStage.Static:
      case RenderStage.EarlyRuntime: {
        // EarlyRuntime is for runtime-prefetchable segments. Sync IO here
        // means the prefetch would be aborted too early.
        this.syncInterruptReason = reason
        this.advanceStage(RenderStage.Dynamic)
        return
      }
      case RenderStage.Runtime: {
        // canSyncInterrupt returns false for Runtime, so we should
        // never get here. Defensive no-op.
        return
      }
      case RenderStage.Dynamic:
      default:
    }
  }

  getSyncInterruptReason() {
    return this.syncInterruptReason
  }

  getStaticStageEndTime() {
    return this.staticStageEndTime
  }

  getRuntimeStageEndTime() {
    return this.runtimeStageEndTime
  }

  private abandonRender() {
    // In staged rendering, only the initial render is abandonable.
    // We can abandon the initial render if
    //   1. We notice a cache miss, and need to wait for caches to fill
    //   2. A sync IO error occurs, and the render should be interrupted
    //      (this might be a lazy intitialization of a module,
    //       so we still want to restart in this case and see if it still occurs)
    // In either case, we'll be doing another render after this one,
    // so we only want to unblock the next stage, not Dynamic, because
    // unblocking the dynamic stage would likely lead to wasted (uncached) IO.
    const { currentStage } = this
    switch (currentStage) {
      case RenderStage.EarlyStatic: {
        this.resolveStaticStage()
      }
      // intentional fallthrough
      case RenderStage.Static: {
        this.resolveEarlyRuntimeStage()
      }
      // intentional fallthrough
      case RenderStage.EarlyRuntime: {
        this.resolveRuntimeStage()
      }
      // intentional fallthrough
      case RenderStage.Runtime: {
        this.currentStage = RenderStage.Abandoned
        return
      }
      case RenderStage.Dynamic:
      case RenderStage.Before:
      case RenderStage.Abandoned:
        break
      default: {
        currentStage satisfies never
      }
    }
  }

  advanceStage(
    stage:
      | RenderStage.EarlyStatic
      | RenderStage.Static
      | RenderStage.EarlyRuntime
      | RenderStage.Runtime
      | RenderStage.Dynamic
  ) {
    // If we're already at the target stage or beyond, do nothing.
    // (this can happen e.g. if sync IO advanced us to the dynamic stage)
    if (stage <= this.currentStage) {
      return
    }

    let currentStage = this.currentStage
    this.currentStage = stage

    if (currentStage < RenderStage.Static && stage >= RenderStage.Static) {
      this.resolveStaticStage()
    }
    if (
      currentStage < RenderStage.EarlyRuntime &&
      stage >= RenderStage.EarlyRuntime
    ) {
      this.resolveEarlyRuntimeStage()
    }
    if (currentStage < RenderStage.Runtime && stage >= RenderStage.Runtime) {
      this.staticStageEndTime = performance.now() + performance.timeOrigin
      this.resolveRuntimeStage()
    }
    if (currentStage < RenderStage.Dynamic && stage >= RenderStage.Dynamic) {
      this.runtimeStageEndTime = performance.now() + performance.timeOrigin
      this.resolveDynamicStage()
      return
    }
  }

  /** Fire the `onStage` listeners for the static stage and unblock any promises waiting for it. */
  private resolveStaticStage() {
    const staticListeners = this.staticStageListeners
    for (let i = 0; i < staticListeners.length; i++) {
      staticListeners[i]()
    }
    staticListeners.length = 0
    this.staticStagePromise.resolve()
  }

  /** Fire the `onStage` listeners for the early runtime stage and unblock any promises waiting for it. */
  private resolveEarlyRuntimeStage() {
    const earlyRuntimeListeners = this.earlyRuntimeStageListeners
    for (let i = 0; i < earlyRuntimeListeners.length; i++) {
      earlyRuntimeListeners[i]()
    }
    earlyRuntimeListeners.length = 0
    this.earlyRuntimeStagePromise.resolve()
  }

  /** Fire the `onStage` listeners for the runtime stage and unblock any promises waiting for it. */
  private resolveRuntimeStage() {
    const runtimeListeners = this.runtimeStageListeners
    for (let i = 0; i < runtimeListeners.length; i++) {
      runtimeListeners[i]()
    }
    runtimeListeners.length = 0
    this.runtimeStagePromise.resolve()
  }

  /** Fire the `onStage` listeners for the dynamic stage and unblock any promises waiting for it. */
  private resolveDynamicStage() {
    const dynamicListeners = this.dynamicStageListeners
    for (let i = 0; i < dynamicListeners.length; i++) {
      dynamicListeners[i]()
    }
    dynamicListeners.length = 0
    this.dynamicStagePromise.resolve()
  }

  private getStagePromise(stage: AdvanceableRenderStage): Promise<void> {
    switch (stage) {
      case RenderStage.Static: {
        return this.staticStagePromise.promise
      }
      case RenderStage.EarlyRuntime: {
        return this.earlyRuntimeStagePromise.promise
      }
      case RenderStage.Runtime: {
        return this.runtimeStagePromise.promise
      }
      case RenderStage.Dynamic: {
        return this.dynamicStagePromise.promise
      }
      default: {
        stage satisfies never
        throw new InvariantError(`Invalid render stage: ${stage}`)
      }
    }
  }

  waitForStage(stage: AdvanceableRenderStage) {
    return this.getStagePromise(stage)
  }

  delayUntilStage<T>(
    stage: AdvanceableRenderStage,
    displayName: string | undefined,
    resolvedValue: T
  ) {
    const ioTriggerPromise = this.getStagePromise(stage)

    const promise = makeDevtoolsIOPromiseFromIOTrigger(
      ioTriggerPromise,
      displayName,
      resolvedValue
    )

    // Analogously to `makeHangingPromise`, we might reject this promise if the signal is invoked.
    // (e.g. in the case where we don't want want the render to proceed to the dynamic stage and abort it).
    // We shouldn't consider this an unhandled rejection, so we attach a noop catch handler here to suppress this warning.
    if (this.abortSignal) {
      promise.catch(ignoreReject)
    }
    return promise
  }
}

function ignoreReject() {}

// TODO(restart-on-cache-miss): the layering of `delayUntilStage`,
// `makeDevtoolsIOPromiseFromIOTrigger` and and `makeDevtoolsIOAwarePromise`
// is confusing, we should clean it up.
function makeDevtoolsIOPromiseFromIOTrigger<T>(
  ioTrigger: Promise<any>,
  displayName: string | undefined,
  resolvedValue: T
): Promise<T> {
  // If we create a `new Promise` and give it a displayName
  // (with no userspace code above us in the stack)
  // React Devtools will use it as the IO cause when determining "suspended by".
  // In particular, it should shadow any inner IO that resolved/rejected the promise
  // (in case of staged rendering, this will be the `setTimeout` that triggers the relevant stage)
  const promise = new Promise<T>((resolve, reject) => {
    ioTrigger.then(resolve.bind(null, resolvedValue), reject)
  })
  if (displayName !== undefined) {
    // @ts-expect-error
    promise.displayName = displayName
  }
  return promise
}
