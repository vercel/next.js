import { InvariantError } from '../../shared/lib/invariant-error'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'

export enum RenderStage {
  Static = 1,
  Runtime = 2,
  Dynamic = 3,
}

export type NonStaticRenderStage = RenderStage.Runtime | RenderStage.Dynamic

export class StagedRenderingController {
  currentStage: RenderStage = RenderStage.Static

  private runtimeStagePromise = createPromiseWithResolvers<void>()
  private dynamicStagePromise = createPromiseWithResolvers<void>()

  constructor(private abortSignal: AbortSignal | null = null) {
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
    }
  }

  advanceStage(stage: NonStaticRenderStage) {
    // If we're already at the target stage or beyond, do nothing.
    // (this can happen e.g. if sync IO advanced us to the dynamic stage)
    if (this.currentStage >= stage) {
      return
    }
    this.currentStage = stage
    // Note that we might be going directly from Static to Dynamic,
    // so we need to resolve the runtime stage as well.
    if (stage >= RenderStage.Runtime) {
      this.runtimeStagePromise.resolve()
    }
    if (stage >= RenderStage.Dynamic) {
      this.dynamicStagePromise.resolve()
    }
  }

  delayUntilStage<T>(stage: NonStaticRenderStage, resolvedValue: T) {
    let stagePromise: Promise<void>
    switch (stage) {
      case RenderStage.Runtime: {
        stagePromise = this.runtimeStagePromise.promise
        break
      }
      case RenderStage.Dynamic: {
        stagePromise = this.dynamicStagePromise.promise
        break
      }
      default: {
        stage satisfies never
        throw new InvariantError(`Invalid render stage: ${stage}`)
      }
    }

    // FIXME: this seems to be the only form that leads to correct API names
    // being displayed in React Devtools (in the "suspended by" section).
    // If we use `promise.then(() => resolvedValue)`, the names are lost.
    // It's a bit strange that only one of those works right.
    const promise = new Promise<T>((resolve, reject) => {
      stagePromise.then(resolve.bind(null, resolvedValue), reject)
    })

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
