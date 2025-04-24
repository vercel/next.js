import { afterCurrentMicrotaskQueueFinished } from '../../lib/scheduler'
import { createPromiseWithResolvers } from '../../shared/lib/promise-with-resolvers'

type AsyncImportSubscriber = (promise: Promise<unknown>) => void

class PendingImportTracker {
  pending = new Set<Promise<unknown>>()
  onAllSettled = createPromiseWithResolvers<void>()

  subscribers = new Set<AsyncImportSubscriber>()

  track(promise: Promise<unknown>): void {
    this.trackAndCallIfLast(promise, this.scheduleBatchEnd)
  }

  /**
   * Tracks `promise`. After the promise settles, if it was the last pending promise,
   * the `onIsLastToSettle` callback will be called.
   * */
  private trackAndCallIfLast(
    promise: Promise<unknown>,
    onIsLastToSettle: () => void
  ): void {
    this.pending.add(promise)
    promise.finally(() => {
      this.pending.delete(promise)
      if (this.pending.size === 0) {
        onIsLastToSettle()
      }
    })

    this.subscribers.forEach((subscriber) => subscriber(promise))
  }

  scheduleBatchEnd = () => {
    // Wait a bit in case the last promise results in any new promises.
    // Track this waiting period like it's a pending import, so that `allSettled` doesn't think we're finished.
    // (we'll also notify subscribers of this so that they correctly wait for it)
    const end = afterCurrentMicrotaskQueueFinished()
    this.trackAndCallIfLast(end, () => {
      // No new promises were added while we waited, or they resolved microtaskily.
      // Time to really finish.
      this.onAllSettled.resolve()
      // now that we resolved the promise, we'll need a new one for subsequent imports.
      this.onAllSettled = createPromiseWithResolvers()
    })
  }

  async allSettled(): Promise<void> {
    if (this.pending.size === 0) {
      // if no imports were tracked, onAllSettled would never resolve
      return
    }
    await this.onAllSettled.promise
  }

  subscribe(listener: AsyncImportSubscriber): () => void {
    const { subscribers } = this
    subscribers.add(listener)
    if (this.pending.size > 0) {
      for (const promise of this.pending) {
        listener(promise)
      }
    }
    return subscribers.delete.bind(subscribers, listener)
  }
}

const tracker = new PendingImportTracker()

export function subscribeToPendingModules(listener: AsyncImportSubscriber) {
  return tracker.subscribe(listener)
}

export function trackPendingChunkLoad(promise: Promise<unknown>) {
  tracker.track(promise)
}

export function trackPendingAsyncImport(promise: Promise<unknown>) {
  tracker.track(promise)
}

export async function waitForPendingModules() {
  await tracker.allSettled()
}
