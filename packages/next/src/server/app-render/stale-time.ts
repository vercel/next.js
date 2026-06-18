import type { ExperimentalConfig } from '../config-shared'
import { INFINITE_CACHE } from '../../lib/constants'
import { StreamingValue } from './streaming-value'

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
export class StaleTimeIterable implements AsyncIterable<number> {
  /** The last value passed to `update()`. */
  public currentValue: number | undefined = undefined

  private _stream = new StreamingValue<number>()

  update(value: number): void {
    if (value === this.currentValue) {
      return
    }
    this.currentValue = value
    this._stream.emit(value)
  }

  close(): void {
    return this._stream.close()
  }

  [Symbol.asyncIterator]() {
    return this._stream[Symbol.asyncIterator]()
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
