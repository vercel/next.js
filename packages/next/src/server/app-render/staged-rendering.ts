import { InvariantError } from '../../shared/lib/invariant-error'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'

export enum RenderStage {
  Static = 1,
  Runtime = 2,
  Dynamic = 3,
  Abandoned = 4,
}

export type NonStaticRenderStage = RenderStage.Runtime | RenderStage.Dynamic

export class StagedRenderingController {
  currentStage: RenderStage = RenderStage.Static
  naturalStage: RenderStage = RenderStage.Static
  staticInterruptReason: Error | null = null
  runtimeInterruptReason: Error | null = null

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
    const boundaryStage = this.hasRuntimePrefetch
      ? RenderStage.Dynamic
      : RenderStage.Runtime
    return this.currentStage < boundaryStage
  }

  syncInterruptCurrentStageWithReason(reason: Error) {
    if (this.mayAbandon) {
      return this.abandonRenderImpl()
    } else {
      switch (this.currentStage) {
        case RenderStage.Static: {
          // We cannot abandon this render. We need to advance to the Dynamic phase
          // but we must also capture the interruption reason.
          this.currentStage = RenderStage.Dynamic
          this.staticInterruptReason = reason

          const runtimeListeners = this.runtimeStageListeners
          for (let i = 0; i < runtimeListeners.length; i++) {
            runtimeListeners[i]()
          }
          runtimeListeners.length = 0
          this.runtimeStagePromise.resolve()

          const dynamicListeners = this.dynamicStageListeners
          for (let i = 0; i < dynamicListeners.length; i++) {
            dynamicListeners[i]()
          }
          dynamicListeners.length = 0
          this.dynamicStagePromise.resolve()
          return
        }
        case RenderStage.Runtime: {
          if (this.hasRuntimePrefetch) {
            // We cannot abandon this render. We need to advance to the Dynamic phase
            // but we must also capture the interruption reason.
            this.currentStage = RenderStage.Dynamic
            this.runtimeInterruptReason = reason

            const dynamicListeners = this.dynamicStageListeners
            for (let i = 0; i < dynamicListeners.length; i++) {
              dynamicListeners[i]()
            }
            dynamicListeners.length = 0
            this.dynamicStagePromise.resolve()
          }
          return
        }
        default:
      }
    }
  }

  getStaticInterruptReason() {
    return this.staticInterruptReason
  }

  getRuntimeInterruptReason() {
    return this.runtimeInterruptReason
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
    switch (this.currentStage) {
      case RenderStage.Static: {
        this.currentStage = RenderStage.Abandoned

        const runtimeListeners = this.runtimeStageListeners
        for (let i = 0; i < runtimeListeners.length; i++) {
          runtimeListeners[i]()
        }
        runtimeListeners.length = 0
        this.runtimeStagePromise.resolve()

        // Even though we are now in the Dynamic stage we don't resolve the dynamic listeners
        // since this render will be abandoned and we don't want to do any more work than necessary
        // to fill caches.
        return
      }
      case RenderStage.Runtime: {
        // We are interrupting a render which can be abandoned.
        this.currentStage = RenderStage.Abandoned

        // Even though we are now in the Dynamic stage we don't resolve the dynamic listeners
        // since this render will be abandoned and we don't want to do any more work than necessary
        // to fill caches.
        return
      }
      default:
    }
  }

  advanceStage(stage: NonStaticRenderStage) {
    // If we're already at the target stage or beyond, do nothing.
    // (this can happen e.g. if sync IO advanced us to the dynamic stage)
    if (stage <= this.currentStage) {
      return
    }

    let currentStage = this.currentStage
    this.currentStage = stage

    if (currentStage < RenderStage.Runtime && stage >= RenderStage.Runtime) {
      const runtimeListeners = this.runtimeStageListeners
      for (let i = 0; i < runtimeListeners.length; i++) {
        runtimeListeners[i]()
      }
      runtimeListeners.length = 0
      this.runtimeStagePromise.resolve()
    }
    if (currentStage < RenderStage.Dynamic && stage >= RenderStage.Dynamic) {
      const dynamicListeners = this.dynamicStageListeners
      for (let i = 0; i < dynamicListeners.length; i++) {
        dynamicListeners[i]()
      }
      dynamicListeners.length = 0
      this.dynamicStagePromise.resolve()
      return
    }
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
