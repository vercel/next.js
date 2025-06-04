/**
 * This class is used to detect when all cache reads for a given render are settled.
 * We do this to allow for cache warming the prerender without having to continue rendering
 * the remainder of the page. This feature is really only useful when the dynamicIO flag is on
 * and should only be used in codepaths gated with this feature.
 */

import { InvariantError } from '../../shared/lib/invariant-error'

export class CacheSignal {
  private count = 0
  private earlyListeners: Array<() => void> = []
  private listeners: Array<() => void> = []
  private tickPending = false
  private taskPending = false

  private subscribedSignals: Set<CacheSignal> | null = null

  constructor() {
    if (process.env.NEXT_RUNTIME === 'edge') {
      // we rely on `process.nextTick`, which is not supported in edge
      throw new InvariantError(
        'CacheSignal cannot be used in the edge runtime, because `dynamicIO` does not support it.'
      )
    }
  }

  private noMorePendingCaches() {
    if (!this.tickPending) {
      this.tickPending = true
      process.nextTick(() => {
        this.tickPending = false
        if (this.count === 0) {
          for (let i = 0; i < this.earlyListeners.length; i++) {
            this.earlyListeners[i]()
          }
          this.earlyListeners.length = 0
        }
      })
    }
    if (!this.taskPending) {
      this.taskPending = true
      setTimeout(() => {
        this.taskPending = false
        if (this.count === 0) {
          for (let i = 0; i < this.listeners.length; i++) {
            this.listeners[i]()
          }
          this.listeners.length = 0
        }
      }, 0)
    }
  }

  /**
   * This promise waits until there are no more in progress cache reads but no later.
   * This allows for adding more cache reads after to delay cacheReady.
   */
  inputReady() {
    return new Promise<void>((resolve) => {
      this.earlyListeners.push(resolve)
      if (this.count === 0) {
        this.noMorePendingCaches()
      }
    })
  }

  /**
   * If there are inflight cache reads this Promise can resolve in a microtask however
   * if there are no inflight cache reads then we wait at least one task to allow initial
   * cache reads to be initiated.
   */
  cacheReady() {
    return new Promise<void>((resolve) => {
      this.listeners.push(resolve)
      if (this.count === 0) {
        this.noMorePendingCaches()
      }
    })
  }

  beginRead() {
    this.count++

    if (this.subscribedSignals !== null) {
      for (const subscriber of this.subscribedSignals) {
        subscriber.beginRead()
      }
    }
  }

  endRead() {
    if (this.count === 0) {
      throw new InvariantError(
        'CacheSignal got more endRead() calls than beginRead() calls'
      )
    }

    // If this is the last read we need to wait a task before we can claim the cache is settled.
    // The cache read will likely ping a Server Component which can read from the cache again and this
    // will play out in a microtask so we need to only resolve pending listeners if we're still at 0
    // after at least one task.
    // We only want one task scheduled at a time so when we hit count 1 we don't decrement the counter immediately.
    // If intervening reads happen before the scheduled task runs they will never observe count 1 preventing reentrency
    this.count--
    if (this.count === 0) {
      this.noMorePendingCaches()
    }

    if (this.subscribedSignals !== null) {
      for (const subscriber of this.subscribedSignals) {
        subscriber.endRead()
      }
    }
  }

  trackRead<T>(promise: Promise<T>) {
    this.beginRead()
    // `promise.finally()` still rejects, so don't use it here to avoid unhandled rejections
    const onFinally = this.endRead.bind(this)
    promise.then(onFinally, onFinally)
    return promise
  }

  subscribeToReads(subscriber: CacheSignal): () => void {
    if (subscriber === this) {
      throw new InvariantError('A CacheSignal cannot subscribe to itself')
    }
    if (this.subscribedSignals === null) {
      this.subscribedSignals = new Set()
    }
    this.subscribedSignals.add(subscriber)

    // we'll notify the subscriber of each endRead() on this signal,
    // so we need to give it a corresponding beginRead() for each read we have in flight now.
    for (let i = 0; i < this.count; i++) {
      subscriber.beginRead()
    }

    return this.unsubscribeFromReads.bind(this, subscriber)
  }

  unsubscribeFromReads(subscriber: CacheSignal) {
    if (!this.subscribedSignals) {
      return
    }
    this.subscribedSignals.delete(subscriber)

    // we don't need to set the set back to `null` if it's empty --
    // if other signals are subscribing to this one, it'll likely get more subscriptions later,
    // so we'd have to allocate a fresh set again when that happens.
  }
}
