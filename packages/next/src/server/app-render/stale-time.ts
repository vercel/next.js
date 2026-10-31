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
  private _buffer: number[] = []

  /** The last value passed to `update()`. */
  public currentValue: number = 0

  update(value: number): void {
    if (this._done) return
    this.currentValue = value
    if (this._resolve) {
      this._resolve({ value, done: false })
      this._resolve = null
    } else {
      this._buffer.push(value)
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
        if (this._buffer.length > 0) {
          return Promise.resolve({ value: this._buffer.shift()!, done: false })
        }
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
