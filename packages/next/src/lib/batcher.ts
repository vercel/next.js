import type { SchedulerFn } from './scheduler'

import { createPromiseWithResolvers } from '../shared/lib/promise-with-resolvers'

type CacheKeyFn<K, C extends string | number | null> = (
  key: K
) => PromiseLike<C> | C

type BatcherOptions<K, C extends string | number | null> = {
  cacheKeyFn?: CacheKeyFn<K, C>
  schedulerFn?: SchedulerFn<void>
}

type WorkFnContext<V, K> = {
  resolve: (value: V | PromiseLike<V>) => void
  key: K
  /**
   * Aborts once every caller waiting on this work has aborted. `undefined` if
   * the first caller didn't pass a signal. If a later caller doesn't pass one,
   * this never aborts, as the work can't be abandoned then.
   */
  signal: AbortSignal | undefined
}

type WorkFn<V, K> = (context: WorkFnContext<V, K>) => Promise<V>

type Pending<V> = {
  promise: Promise<V>
  /** Only defined if all callers of the batch were given an AbortSignal */
  abortable:
    | {
        /** The controller for the underlying work item */
        controller: AbortController
        /**
         * Count of callers with a signal that are still waiting to prevent
         * aborting coalesced work items if only some of the callers have
         * cancelled.
         */
        waiting: number
      }
    | undefined
}

/**
 * A wrapper for a function that will only allow one call to the function to
 * execute at a time.
 */
export class Batcher<K, V, C extends string | number | null> {
  private readonly pending = new Map<C, Pending<V>>()

  protected constructor(
    private readonly cacheKeyFn?: CacheKeyFn<K, C>,
    /**
     * A function that will be called to schedule the wrapped function to be
     * executed. This defaults to a function that will execute the function
     * immediately.
     */
    private readonly schedulerFn: SchedulerFn<void> = (fn) => fn()
  ) {}

  /**
   * Creates a new instance of PendingWrapper. If the key extends a string or
   * number, the key will be used as the cache key. If the key is an object, a
   * cache key function must be provided.
   */
  public static create<K extends string | number | null, V>(
    options?: BatcherOptions<K, K>
  ): Batcher<K, V, K>
  public static create<K, V, C extends string | number | null>(
    options: BatcherOptions<K, C> &
      Required<Pick<BatcherOptions<K, C>, 'cacheKeyFn'>>
  ): Batcher<K, V, C>
  public static create<K, V, C extends string | number | null>(
    options?: BatcherOptions<K, C>
  ): Batcher<K, V, C> {
    return new Batcher<K, V, C>(options?.cacheKeyFn, options?.schedulerFn)
  }

  /**
   * Wraps a function in a promise that will be resolved or rejected only once
   * for a given key. This will allow multiple calls to the function to be
   * made, but only one will be executed at a time. The result of the first
   * call will be returned to all callers.
   *
   * Once every caller waiting on the work has aborted, the work's own signal
   * aborts and later calls start new work rather than joining it. Callers
   * still get the work's result or rejection, so work that finishes despite
   * the abort still resolves.
   *
   * @param key the key to use for the cache
   * @param fn the function to wrap
   * @param signal rejects immediately if already aborted, otherwise counts
   * this caller as no longer needing the result once it aborts
   * @returns a promise that resolves to the result of the function
   */
  public async batch(
    key: K,
    fn: WorkFn<V, K>,
    signal?: AbortSignal
  ): Promise<V> {
    const cacheKey = (this.cacheKeyFn ? await this.cacheKeyFn(key) : key) as C
    signal?.throwIfAborted()

    if (cacheKey === null) {
      // Without a key, calls aren't batched, so `fn` gets the caller's signal
      return fn({ resolve: (value) => Promise.resolve(value), key, signal })
    }

    const entry =
      this.pending.get(cacheKey) ?? this.start(cacheKey, key, fn, signal)

    if (!signal) {
      // if we get a call that is not abortable, a previously-abortable work
      // item is no longer abortable.
      entry.abortable = undefined
      return entry.promise
    }
    const { abortable } = entry
    if (!abortable) {
      return entry.promise
    }

    abortable.waiting++
    const abort = () => {
      // A caller without a signal may have joined since, clearing `abortable`
      if (!entry.abortable || --abortable.waiting > 0) return
      // Nobody is waiting on the result anymore, so stop the work, and don't
      // coalesce new callers with the aborted work item
      this.removePending(cacheKey, entry)
      abortable.controller.abort(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    return entry.promise.finally(() =>
      signal.removeEventListener('abort', abort)
    )
  }

  private start(
    cacheKey: C,
    key: K,
    fn: WorkFn<V, K>,
    signal: AbortSignal | undefined
  ): Pending<V> {
    const { promise, resolve, reject } = createPromiseWithResolvers<V>()
    const abortable = signal
      ? { controller: new AbortController(), waiting: 0 }
      : undefined
    const entry: Pending<V> = { promise, abortable }
    this.pending.set(cacheKey, entry)

    const workSignal = abortable?.controller.signal
    this.schedulerFn(async () => {
      try {
        // Every caller may have aborted before the scheduler ran this
        workSignal?.throwIfAborted()
        const result = await fn({ resolve, key, signal: workSignal })

        // Resolving a promise multiple times is a no-op, so we can safely
        // resolve all pending promises with the same result.
        resolve(result)
      } catch (err) {
        reject(err)
      } finally {
        this.removePending(cacheKey, entry)
      }
    })

    return entry
  }

  private removePending(cacheKey: C, entry: Pending<V>) {
    // Aborted work is removed early, so new work may have replaced it
    if (this.pending.get(cacheKey) === entry) {
      this.pending.delete(cacheKey)
    }
  }
}
