import type { ExperimentalConfig } from '../config-shared'
import { INFINITE_CACHE } from '../../lib/constants'

/**
 * An AsyncIterable<number> that yields staleTime values. Each call to
 * `update()` yields the new value. When `close()` is called, the iteration
 * ends.
 *
 * This is included in the RSC payload so Flight serializes each yielded value
 * into the stream immediately. If the prerender is aborted by sync IO, the last
 * yielded value is already in the stream, allowing the prerender to be aborted
 * synchronously.
 */
export class StaleTimeIterable {
  private _resolve: ((result: IteratorResult<number>) => void) | null = null
  private _done = false

  /** The last value passed to `update()`. */
  public currentValue: number = 0

  update(value: number): void {
    if (this._done) return
    this.currentValue = value
    if (this._resolve) {
      this._resolve({ value, done: false })
      this._resolve = null
    }
  }

  close(): void {
    if (this._done) return
    this._done = true
    if (this._resolve) {
      this._resolve({ value: undefined, done: true })
      this._resolve = null
    }
  }

  [Symbol.asyncIterator](): AsyncIterator<number> {
    return {
      next: () => {
        if (this._done) {
          return Promise.resolve({ value: undefined, done: true })
        }
        return new Promise<IteratorResult<number>>((resolve) => {
          this._resolve = resolve
        })
      },
    }
  }
}

export function createSelectStaleTime(experimental: ExperimentalConfig) {
  return (stale: number) =>
    stale === INFINITE_CACHE &&
    typeof experimental.staleTimes?.static === 'number'
      ? experimental.staleTimes.static
      : stale
}

/**
 * Intercepts writes to the `stale` field on the prerender store and yields
 * each update (after applying selectStaleTime) through the iterable. This
 * ensures the latest stale time is always serialized in the Flight stream,
 * even if the prerender is aborted by sync IO.
 */
export function trackStaleTime(
  store: { stale: number },
  iterable: StaleTimeIterable,
  selectStaleTime: (stale: number) => number
): void {
  let _stale = store.stale
  iterable.update(selectStaleTime(_stale))
  Object.defineProperty(store, 'stale', {
    get: () => _stale,
    set: (value: number) => {
      _stale = value
      iterable.update(selectStaleTime(value))
    },
    configurable: true,
    enumerable: true,
  })
}

/**
 * Closes the stale time iterable and waits for React to flush the closing
 * chunk into the Flight stream. This also allows the prerender to complete if
 * no other work is pending.
 *
 * Flight's internal work gets scheduled as a microtask when we close the
 * iterable. We need to ensure Flight's pending queues are emptied before this
 * function returns, because the caller will abort the prerender immediately
 * after. We can't use a macrotask (that would allow dynamic IO to sneak into
 * the response), so we use microtasks instead. The exact number of awaits
 * isn't important as long as we wait enough ticks for Flight to finish writing.
 */
export async function finishStaleTimeTracking(
  iterable: StaleTimeIterable
): Promise<void> {
  iterable.close()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}
