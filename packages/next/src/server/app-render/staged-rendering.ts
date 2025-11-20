import { InvariantError } from '../../shared/lib/invariant-error'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'

export enum RenderStage {
  Before = 1,
  Static = 2,
  Runtime = 3,
  Dynamic = 4,
  Abandoned = 5,
}

export type NonStaticRenderStage = RenderStage.Runtime | RenderStage.Dynamic

export class StagedRenderingController {
  currentStage: RenderStage = RenderStage.Before

  staticInterruptReason: Error | null = null
  runtimeInterruptReason: Error | null = null
  staticStageEndTime: number = Infinity
  runtimeStageEndTime: number = Infinity

  private runtimeStageListeners: Array<() => void> = []
  private dynamicStageListeners: Array<() => void> = []

  private runtimeStagePromise = createPromiseWithResolvers<void>()
  private dynamicStagePromise = createPromiseWithResolvers<void>()

  private mayAbandon: boolean = false

  constructor(
    private abortSignal: AbortSignal | null = null,
    private hasRuntimePrefetch: boolean
  ) {
    if (abortSignal) {
      abortSignal.addEventListener(
        'abort',
        () => {
          const { reason } = abortSignal
          if (this.currentStage < RenderStage.Runtime) {
            this.runtimeStagePromise.promise.catch(ignoreReject) // avoid unhandled rejections
            this.runtimeStagePromise.reject(reason)
          }
          if (this.currentStage < RenderStage.Dynamic) {
            this.dynamicStagePromise.promise.catch(ignoreReject) // avoid unhandled rejections
            this.dynamicStagePromise.reject(reason)
          }
        },
        { once: true }
      )

      this.mayAbandon = true
    }
  }

  onStage(stage: NonStaticRenderStage, callback: () => void) {
    if (this.currentStage >= stage) {
      callback()
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

    const boundaryStage = this.hasRuntimePrefetch
      ? RenderStage.Dynamic
      : RenderStage.Runtime
    return this.currentStage < boundaryStage
  }

  syncInterruptCurrentStageWithReason(reason: Error) {
    if (this.currentStage === RenderStage.Before) {
      return
    }

    // If Sync IO occurs during the initial (abandonable) render, we'll retry it,
    // so we want a slightly different flow.
    // See the implementation of `abandonRenderImpl` for more explanation.
    if (this.mayAbandon) {
      return this.abandonRenderImpl()
    }

    // If we're in the final render, we cannot abandon it. We need to advance to the Dynamic stage
    // and capture the interruption reason.
    switch (this.currentStage) {
      case RenderStage.Static: {
        this.staticInterruptReason = reason
        this.advanceStage(RenderStage.Dynamic)
        return
      }
      case RenderStage.Runtime: {
        // We only error for Sync IO in the runtime stage if the route
        // is configured to use runtime prefetching.
        // We do this to reflect the fact that during a runtime prefetch,
        // Sync IO aborts aborts the render.
        // Note that `canSyncInterrupt` should prevent us from getting here at all
        // if runtime prefetching isn't enabled.
        if (this.hasRuntimePrefetch) {
          this.runtimeInterruptReason = reason
          this.advanceStage(RenderStage.Dynamic)
        }
        return
      }
      case RenderStage.Dynamic:
      case RenderStage.Abandoned:
      default:
    }
  }

  getStaticInterruptReason() {
    return this.staticInterruptReason
  }

  getRuntimeInterruptReason() {
    return this.runtimeInterruptReason
  }

  getStaticStageEndTime() {
    return this.staticStageEndTime
  }

  getRuntimeStageEndTime() {
    return this.runtimeStageEndTime
  }

  abandonRender() {
    if (!this.mayAbandon) {
      throw new InvariantError(
        '`abandonRender` called on a stage controller that cannot be abandoned.'
      )
    }

    this.abandonRenderImpl()
  }

  private abandonRenderImpl() {
    // In staged rendering, only the initial render is abandonable.
    // We can abandon the initial render if
    //   1. We notice a cache miss, and need to wait for caches to fill
    //   2. A sync IO error occurs, and the render should be interrupted
    //      (this might be a lazy intitialization of a module,
    //       so we still want to restart in this case and see if it still occurs)
    // In either case, we'll be doing another render after this one,
    // so we only want to unblock the Runtime stage, not Dynamic, because
    // unblocking the dynamic stage would likely lead to wasted (uncached) IO.
    const { currentStage } = this
    switch (currentStage) {
      case RenderStage.Static: {
        this.currentStage = RenderStage.Abandoned
        this.resolveRuntimeStage()
        return
      }
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
    stage: RenderStage.Static | RenderStage.Runtime | RenderStage.Dynamic
  ) {
    // If we're already at the target stage or beyond, do nothing.
    // (this can happen e.g. if sync IO advanced us to the dynamic stage)
    if (stage <= this.currentStage) {
      return
    }

    let currentStage = this.currentStage
    this.currentStage = stage

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

  private getStagePromise(stage: NonStaticRenderStage): Promise<void> {
    switch (stage) {
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

  waitForStage(stage: NonStaticRenderStage) {
    return this.getStagePromise(stage)
  }

  delayUntilStage<T>(
    stage: NonStaticRenderStage,
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
