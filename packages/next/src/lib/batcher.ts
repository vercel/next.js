import type { SchedulerFn } from './scheduler'

import { DetachedPromise } from './detached-promise'

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
}

type WorkFn<V, K> = (context: WorkFnContext<V, K>) => Promise<V>

/**
 * A wrapper for a function that will only allow one call to the function to
 * execute at a time.
 */
export class Batcher<K, V, C extends string | number | null> {
  private readonly pending = new Map<C, Promise<V>>()

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
   * @param key the key to use for the cache
   * @param fn the function to wrap
   * @returns a promise that resolves to the result of the function
   */
  public async batch(key: K, fn: WorkFn<V, K>): Promise<V> {
    const cacheKey = (this.cacheKeyFn ? await this.cacheKeyFn(key) : key) as C
    if (cacheKey === null) {
      return fn({ resolve: (value) => Promise.resolve(value), key })
    }

    const pending = this.pending.get(cacheKey)
    if (pending) return pending

    const { promise, resolve, reject } = new DetachedPromise<V>()
    this.pending.set(cacheKey, promise)

    this.schedulerFn(async () => {
      try {
        const result = await fn({ resolve, key })

        // Resolving a promise multiple times is a no-op, so we can safely
        // resolve all pending promises with the same result.
        resolve(result)
      } catch (err) {
        reject(err)
      } finally {
        this.pending.delete(cacheKey)
      }
    })

    return promise
  }
}
