import { InvariantError } from '../../shared/lib/invariant-error'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'

export enum RenderStage {
  Before = 1,
  //
  EarlyStatic = 2,
  Static = 3,
  //
  EarlyRuntime = 4,
  Runtime = 5,
  //
  Dynamic = 6,
  Abandoned = 7,
}

export type AdvanceableRenderStage = Exclude<
  RenderStage,
  RenderStage.Before | RenderStage.Abandoned
>

export const RENDER_STAGE_ADVANCE_ORDER: AdvanceableRenderStage[] = [
  RenderStage.EarlyStatic,
  RenderStage.Static,
  //
  RenderStage.EarlyRuntime,
  RenderStage.Runtime,
  //
  RenderStage.Dynamic,
]

export function getNextStage(
  stage: Exclude<AdvanceableRenderStage, RenderStage.Dynamic>
) {
  return RENDER_STAGE_ADVANCE_ORDER[
    RENDER_STAGE_ADVANCE_ORDER.indexOf(stage) + 1
  ]
}

export function isEarlyRenderStage(
  stage: Exclude<RenderStage, RenderStage.Before>
): boolean {
  switch (stage) {
    case RenderStage.EarlyStatic:
    case RenderStage.EarlyRuntime: {
      return true
    }
    case RenderStage.Static:
    case RenderStage.Runtime:
    case RenderStage.Dynamic:
    case RenderStage.Abandoned: {
      return false
    }
    default: {
      stage satisfies never
      throw new InvariantError(`Invalid render stage: ${stage}`)
    }
  }
}

export class StagedRenderingController {
  private abortSignal: AbortSignal | null
  private abandonController: AbortController | null
  private shouldTrackSyncIO: boolean

  currentStage: RenderStage = RenderStage.Before

  syncInterruptReason: Error | null = null

  triggers: Record<AdvanceableRenderStage, StageTrigger> = {
    [RenderStage.EarlyStatic]: createStageTrigger(),
    [RenderStage.Static]: createStageTrigger(),
    //
    [RenderStage.EarlyRuntime]: createStageTrigger(),
    [RenderStage.Runtime]: createStageTrigger(),
    //
    [RenderStage.Dynamic]: createStageTrigger(),
  }

  constructor({
    abortSignal,
    abandonController,
    shouldTrackSyncIO,
  }: {
    abortSignal: AbortSignal | null
    abandonController: AbortController | null
    shouldTrackSyncIO: boolean
  }) {
    this.abortSignal = abortSignal
    this.abandonController = abandonController
    this.shouldTrackSyncIO = shouldTrackSyncIO

    if (abortSignal) {
      abortSignal.addEventListener(
        'abort',
        () => {
          // Reject all stage promises that haven't already been resolved.
          // `cancelStageTrigger` is a noop if the trigger already resolved.
          const { reason } = abortSignal
          for (const trigger of Object.values(this.triggers)) {
            cancelStageTrigger(trigger, reason)
          }
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
    addSyncTriggerListener(this.triggers[stage], callback)
  }

  shouldTrackSyncInterrupt(): boolean {
    if (!this.shouldTrackSyncIO) {
      return false
    }

    switch (this.currentStage) {
      case RenderStage.Before:
        // If we haven't started the render yet, it can't be interrupted.
        return false
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
        this.currentStage satisfies never
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

    if (this.abortSignal) {
      // If this is an abortable render, we capture the interruption reason and stop advancing.
      // We don't release any more promises.
      // The caller is expected to abort the signal.
      this.syncInterruptReason = reason
      this.currentStage = RenderStage.Abandoned
      return
    }

    // If we're in a non-abandonable & non-abortable render,
    // we need to advance to the Dynamic stage and capture the interruption reason.
    // (in dev, this will be the restarted render)
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
        // `shouldTrackSyncInterrupt` returns false for Runtime, so we should
        // never get here. Defensive no-op.
        break
      }
      case RenderStage.Dynamic: {
        // `shouldTrackSyncInterrupt` returns false for Dynamic, so we should
        // never get here. Defensive no-op.
        break
      }
      default: {
        this.currentStage satisfies never
      }
    }
  }

  getSyncInterruptReason() {
    return this.syncInterruptReason
  }

  getStaticStageEndTime() {
    // The Static stage ends when the stage after it began.
    return (
      this.triggers[getNextStage(RenderStage.Static)].triggeredAt ?? Infinity
    )
  }

  getRuntimeStageEndTime() {
    // The Runtime stage ended when the stage after it began.
    return (
      this.triggers[getNextStage(RenderStage.Runtime)].triggeredAt ?? Infinity
    )
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
      case RenderStage.Before: {
        throw new InvariantError(
          "A render that hasn't started yet cannot be abandoned"
        )
      }
      case RenderStage.EarlyStatic:
      case RenderStage.Static:
      case RenderStage.EarlyRuntime:
      case RenderStage.Runtime: {
        // Resolve all stages after the current one, up to runtime (excluding dynamic)
        const nextStageIx = RENDER_STAGE_ADVANCE_ORDER.indexOf(currentStage) + 1
        const dynamicStageIx = RENDER_STAGE_ADVANCE_ORDER.indexOf(
          RenderStage.Dynamic
        )
        for (let i = nextStageIx; i < dynamicStageIx; i++) {
          this.resolveStage(RENDER_STAGE_ADVANCE_ORDER[i])
        }

        this.currentStage = RenderStage.Abandoned
        break
      }
      case RenderStage.Dynamic:
      case RenderStage.Abandoned: {
        break
      }
      default: {
        currentStage satisfies never
      }
    }
  }

  advanceStage(targetStage: AdvanceableRenderStage) {
    // If we're already at the target stage or beyond, do nothing.
    // (this can happen e.g. if sync IO advanced us to the dynamic stage)
    if (targetStage <= this.currentStage) {
      return
    }

    const { currentStage } = this
    this.currentStage = targetStage

    switch (currentStage) {
      case RenderStage.Before:
      case RenderStage.EarlyStatic:
      case RenderStage.Static:
      case RenderStage.EarlyRuntime:
      case RenderStage.Runtime: {
        // Resolve all stages between the current stage and the target.
        const nextStageIx =
          currentStage === RenderStage.Before
            ? 0
            : RENDER_STAGE_ADVANCE_ORDER.indexOf(currentStage) + 1
        const targetStageIx = RENDER_STAGE_ADVANCE_ORDER.indexOf(targetStage)
        for (let i = nextStageIx; i <= targetStageIx; i++) {
          this.resolveStage(RENDER_STAGE_ADVANCE_ORDER[i])
        }
        break
      }
      case RenderStage.Dynamic:
      case RenderStage.Abandoned: {
        break
      }
      default: {
        currentStage satisfies never
      }
    }
  }

  private resolveStage(stage: AdvanceableRenderStage) {
    fireStageTrigger(this.triggers[stage])
  }

  private getStagePromise(stage: AdvanceableRenderStage): Promise<void> {
    return this.triggers[stage].promise
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

type StageTrigger = {
  state: 'pending' | 'triggered' | 'cancelled'
  triggeredAt: number | null
  promise: Promise<void>
  _listeners: Array<() => void>
  _resolvePromise: () => void
  _rejectPromise: (reason: unknown) => void
}

function addSyncTriggerListener(trigger: StageTrigger, listener: () => void) {
  if (trigger.state === 'pending') {
    trigger._listeners.push(listener)
  } else {
    listener()
  }
}

function createStageTrigger(): StageTrigger {
  const { promise, resolve, reject } = createPromiseWithResolvers<void>()
  return {
    state: 'pending',
    triggeredAt: null,
    promise,
    _listeners: [],
    _resolvePromise: resolve,
    _rejectPromise: reject,
  }
}

function fireStageTrigger(trigger: StageTrigger) {
  if (trigger.state !== 'pending') {
    return
  }
  trigger.state = 'triggered'
  trigger.triggeredAt = performance.now() + performance.timeOrigin
  try {
    const { _listeners: listeners } = trigger
    for (let i = 0; i < listeners.length; i++) {
      listeners[i]()
    }
    listeners.length = 0
  } finally {
    trigger._resolvePromise()
  }
}

function cancelStageTrigger(trigger: StageTrigger, reason: unknown) {
  if (trigger.state !== 'pending') {
    return
  }
  trigger.state = 'cancelled'
  // we didn't trigger, so don't save `triggeredAt`.

  // We're not gonna fire the listeners, we may as well free them.
  trigger._listeners.length = 0

  // Suppress unhandled rejection warnings for promises that no one is awaiting.
  trigger.promise.catch(ignoreReject)
  trigger._rejectPromise(reason)
}
