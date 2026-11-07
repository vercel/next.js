import type { AnyStream } from '../app-render/stream-ops'

/**
 * How long state for an HTML request is kept for its HMR client to claim. The
 * browser opens the HMR WebSocket (carrying the HTML request ID) shortly after
 * the page starts hydrating, so this only needs to cover slow initial loads.
 * Requests whose client never connects (e.g. when `curl`ing the page, fetching
 * it from a script, or loading it with JavaScript disabled) would otherwise
 * retain the parked state for the lifetime of the dev server.
 */
export const PARKED_ENTRY_TIMEOUT_MS = 30_000

type ParkedEntry<T> = {
  value: T
  timeout: ReturnType<typeof setTimeout> | undefined
}

/**
 * A map of values that are parked for an HTML request until its HMR client
 * connects and claims them. A value that isn't claimed (or deleted) within
 * `timeoutMs` is evicted, and passed to `onEvict` so that it can be released.
 */
export class ParkedEntries<T> {
  private readonly entries = new Map<string, ParkedEntry<T>>()

  constructor(
    private readonly onEvict?: (value: T) => void,
    private readonly timeoutMs: number = PARKED_ENTRY_TIMEOUT_MS
  ) {}

  get size(): number {
    return this.entries.size
  }

  /**
   * Parks a value for the given HTML request ID, replacing (without releasing)
   * any value that was previously parked for it.
   */
  set(htmlRequestId: string, value: T): void {
    this.delete(htmlRequestId)

    const entry: ParkedEntry<T> = { value, timeout: undefined }

    entry.timeout = setTimeout(() => {
      // The entry might have been replaced in the meantime. Its timer would
      // have been cleared then, but check anyway, so that we never evict a
      // newer entry.
      if (this.entries.get(htmlRequestId) !== entry) {
        return
      }

      this.entries.delete(htmlRequestId)

      try {
        this.onEvict?.(value)
      } catch {
        // Releasing an evicted value is best-effort.
      }
    }, this.timeoutMs)

    // Don't keep the process alive just to evict parked values.
    entry.timeout.unref?.()

    this.entries.set(htmlRequestId, entry)
  }

  /**
   * Removes and returns the value parked for the given HTML request ID, if any.
   */
  take(htmlRequestId: string): T | undefined {
    const entry = this.entries.get(htmlRequestId)

    if (!entry) {
      return undefined
    }

    clearTimeout(entry.timeout)
    this.entries.delete(htmlRequestId)

    return entry.value
  }

  /**
   * Removes the value parked for the given HTML request ID, if any, without
   * releasing it.
   */
  delete(htmlRequestId: string): void {
    this.take(htmlRequestId)
  }
}

/**
 * Releases a parked stream that no client is going to read, so that the chunks
 * it has buffered can be garbage collected. This only affects the parked
 * stream, and not any other consumers of the same source.
 */
export function releaseParkedStream(stream: AnyStream): void {
  if (stream instanceof ReadableStream) {
    stream.cancel().catch(() => {
      // Cancelling is best-effort.
    })
  } else {
    stream.destroy()
  }
}
