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
