import { NEXT_REQUEST_ID_HEADER } from '../components/app-router-headers'
import { InvariantError } from '../../shared/lib/invariant-error'

export interface DebugChannelReadableWriterPair {
  readonly readable: ReadableStream<Uint8Array>
  readonly writer: WritableStreamDefaultWriter<Uint8Array>
}

const pairs = new Map<string, DebugChannelReadableWriterPair>()

const DEBUG_CHANNEL_STORAGE_KEY_PREFIX = '__next_debug_channel:'

// Buffer for the initial document's debug channel data. Written to
// sessionStorage once complete so it can be restored when the browser serves
// the page from HTTP cache (back-forward navigation, tab duplication, etc.).
let initialDocumentDebugChunks: Uint8Array[] = []

function persistDebugChannelToSessionStorage(requestId: string): void {
  const key = DEBUG_CHANNEL_STORAGE_KEY_PREFIX + requestId
  const value = JSON.stringify(
    initialDocumentDebugChunks.map((chunk) => {
      let binary = ''
      for (let i = 0; i < chunk.byteLength; i++) {
        binary += String.fromCharCode(chunk[i])
      }
      return btoa(binary)
    })
  )

  try {
    sessionStorage.setItem(key, value)
  } catch {
    // Likely a quota error. Drop entries from previous documents in this tab
    // (we only need to restore the current one's entry on cache restore) and
    // retry once. If it still fails, skip silently — the location.reload()
    // fallback in createDebugChannel handles this case.
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i)
      if (k?.startsWith(DEBUG_CHANNEL_STORAGE_KEY_PREFIX) && k !== key) {
        sessionStorage.removeItem(k)
      }
    }
    try {
      sessionStorage.setItem(key, value)
    } catch {}
  }
}

const enum ExecTimeCacheDecision {
  /**
   * The HTML document was served from the browser's cache; replay the
   * previously persisted chunks instead of waiting for the WebSocket-backed
   * channel.
   */
  CacheRestore,

  /**
   * The HTML document came fresh from the server. The live WebSocket-backed
   * channel will deliver the debug chunks.
   */
  FreshResponse,

  /**
   * Can't tell from the navigation entry as it stands now. Caller should defer
   * to `pageshow` and re-check there with `wasServedFromCacheAtPageshow`.
   */
  Undecided,
}

/**
 * Decide at script-execution time whether the document was served from the
 * browser's cache or freshly fetched from the server. `type === 'back_forward'`
 * alone isn't enough: a back/forward navigation can also be a fresh server
 * re-fetch when the HTTP cache entry was evicted (long-lived tab, storage
 * pressure, manual cache clear), and treating that as a cache restore would
 * trigger an unnecessary `location.reload()` when no persisted chunks are
 * found.
 */
function wasServedFromCacheKnownAtExec(
  entry: NavigationEntry | undefined
): ExecTimeCacheDecision {
  if (!entry) {
    return ExecTimeCacheDecision.FreshResponse
  }

  // Safari tab-duplication cache restore: type='navigate' paired with
  // responseStart=0 (no first-body-byte over the network) and a non-zero
  // responseEnd. Fresh navigations always have responseStart > 0.
  if (
    entry.type === 'navigate' &&
    entry.responseStart === 0 &&
    entry.responseEnd > 0
  ) {
    return ExecTimeCacheDecision.CacheRestore
  }

  // Every remaining cache-restore signal requires a back/forward navigation.
  // (bfcache restores don't re-execute scripts and never reach this code.)
  if (entry.type !== 'back_forward') {
    return ExecTimeCacheDecision.FreshResponse
  }

  // Chrome ≥109 and Safari ≥17 populate `deliveryType` at exec time even when
  // the size fields aren't filled in yet. This is the only exec-time fast path
  // for real Safari ≥17 cache restores (Safari leaves encodedBodySize at 0 at
  // exec).
  if (entry.deliveryType === 'cache') {
    return ExecTimeCacheDecision.CacheRestore
  }

  // Chrome and Firefox publish an HTTP cache restore as transferSize=0 (no
  // bytes over the wire) plus a non-zero cached body size at exec time.
  if (entry.transferSize === 0 && entry.encodedBodySize > 0) {
    return ExecTimeCacheDecision.CacheRestore
  }

  // No body bytes measured yet. Either the response is still streaming, or
  // WebKit is reporting transferSize=0 and encodedBodySize=0 at exec time
  // regardless of whether the document was cached or re-fetched. Defer to
  // `pageshow` where the two cases become distinguishable.
  if (entry.encodedBodySize === 0) {
    return ExecTimeCacheDecision.Undecided
  }

  // Body bytes already measured at exec time with no other cache signal: a
  // re-fetched back-nav whose response happened to complete before our script
  // ran. The deferred branch above would have caught the same case if the
  // response had still been streaming.
  return ExecTimeCacheDecision.FreshResponse
}

/**
 * Re-check the cache-restore decision at `pageshow`, when every browser has
 * populated the navigation-entry size fields. Only called when
 * `wasServedFromCacheKnownAtExec` returned `ExecTimeCacheDecision.Undecided`.
 */
function wasServedFromCacheAtPageshow(
  entry: NavigationEntry | undefined
): boolean {
  if (!entry) {
    return false
  }

  // Safari tab-duplication signature; see the matching branch in
  // `wasServedFromCacheKnownAtExec`.
  if (
    entry.type === 'navigate' &&
    entry.responseStart === 0 &&
    entry.responseEnd > 0
  ) {
    return true
  }

  // A back/forward navigation where at least one of the size fields is zero
  // means the body didn't come over the wire. Browsers signal a cache restore
  // differently — Chrome/Firefox zero `transferSize` and keep a non-zero cached
  // `encodedBodySize`; Safari does the inverse with a small `transferSize`
  // (header overhead) and `encodedBodySize=0`; WebKit under Playwright zeros
  // both. A fresh re-fetch populates both with the response size.
  return (
    entry.type === 'back_forward' &&
    (entry.transferSize === 0 || entry.encodedBodySize === 0)
  )
}

/**
 * The DOM lib's `PerformanceNavigationTiming` doesn't include the
 * `deliveryType` property yet, even though it's shipped in Chrome ≥109,
 * Firefox ≥115, and Safari ≥17. See
 * https://w3c.github.io/navigation-timing/#dom-performancenavigationtiming-deliverytype.
 */
type NavigationEntry = PerformanceNavigationTiming & {
  readonly deliveryType?: string
}

function getNavigationEntry(): NavigationEntry | undefined {
  try {
    return performance.getEntriesByType('navigation')[0] as
      | NavigationEntry
      | undefined
  } catch {
    return undefined
  }
}

function restoreDebugChannelFromSessionStorage(
  requestId: string
): ReadableStream<Uint8Array> | undefined {
  try {
    const serializedData = sessionStorage.getItem(
      DEBUG_CHANNEL_STORAGE_KEY_PREFIX + requestId
    )

    if (!serializedData) {
      return undefined
    }

    const chunks = (JSON.parse(serializedData) as string[]).map((base64) => {
      const binary = atob(base64)
      const bytes = new Uint8Array(binary.length)
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i)
      }
      return bytes
    })

    return new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) {
          controller.enqueue(chunk)
        }
        controller.close()
      },
    })
  } catch {
    return undefined
  }
}

export function getOrCreateDebugChannelReadableWriterPair(
  requestId: string
): DebugChannelReadableWriterPair {
  let pair = pairs.get(requestId)

  if (!pair) {
    // Only buffer chunks for the initial document's debug channel, not for
    // client-side navigation requests.
    const shouldBuffer = requestId === self.__next_r

    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        if (shouldBuffer) {
          initialDocumentDebugChunks.push(chunk.slice())
        }
        controller.enqueue(chunk)
      },
    })

    pair = { readable, writer: writable.getWriter() }
    pairs.set(requestId, pair)

    pair.writer.closed
      .then(() => {
        if (shouldBuffer) {
          persistDebugChannelToSessionStorage(requestId)
        }
      })
      .finally(() => pairs.delete(requestId))
  }

  return pair
}

export function createDebugChannel(
  requestHeaders: Record<string, string> | undefined
): {
  writable?: WritableStream
  readable?: ReadableStream
} {
  let requestId: string | undefined

  if (requestHeaders) {
    requestId = requestHeaders[NEXT_REQUEST_ID_HEADER] ?? undefined

    if (!requestId) {
      throw new InvariantError(
        `Expected a ${JSON.stringify(NEXT_REQUEST_ID_HEADER)} request header.`
      )
    }
  } else {
    requestId = self.__next_r

    if (!requestId) {
      throw new InvariantError(
        `Expected a request ID to be defined for the document via self.__next_r.`
      )
    }
  }

  // Only attempt to restore the sessionStorage debug channel entry for the
  // initial document load (no request headers). Client-side navigations pass
  // request headers and should always use the WebSocket-backed debug channel.
  if (!requestHeaders) {
    switch (wasServedFromCacheKnownAtExec(getNavigationEntry())) {
      case ExecTimeCacheDecision.CacheRestore:
        return { readable: restoreDebugChannelOrReload(requestId) }
      case ExecTimeCacheDecision.Undecided:
        // Body bytes haven't been measured on the navigation entry yet. Suspend
        // the stream until pageshow, re-check there, then source from the
        // persisted chunks or the WebSocket-backed pair accordingly.
        return { readable: createDeferredDebugChannelReadable(requestId) }
      case ExecTimeCacheDecision.FreshResponse:
        // Fall through to the shared WebSocket-backed channel below.
        break
    }
  }

  const { readable } = getOrCreateDebugChannelReadableWriterPair(requestId)

  return { readable }
}

/**
 * Try to restore the debug channel from the persisted chunks. If none are
 * found, force a fresh page load.
 */
function restoreDebugChannelOrReload(
  requestId: string
): ReadableStream<Uint8Array> {
  const readable = restoreDebugChannelFromSessionStorage(requestId)

  if (readable) {
    return readable
  }

  // No persisted entry. Typically this happens when the HTTP cache held the
  // HTML but the persisted entry was never written, or was overwritten by a
  // newer document in this tab.
  location.reload()

  // Never-closing stream. Keeps the Flight client suspended until the reload
  // tears the document down, instead of letting it synchronously error with
  // "Connection closed.".
  return new ReadableStream<Uint8Array>()
}

/**
 * Used when `wasServedFromCacheKnownAtExec` returns
 * `ExecTimeCacheDecision.Undecided`. Waits for `pageshow`, re-runs the check,
 * and forwards data from either the persisted chunks or the WebSocket.
 */
function createDeferredDebugChannelReadable(
  requestId: string
): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      // By `pageshow` every browser has populated the navigation-entry size
      // fields, so the re-check below is unambiguous.
      await new Promise<void>((resolve) => {
        window.addEventListener('pageshow', () => resolve(), { once: true })
      })

      const source = wasServedFromCacheAtPageshow(getNavigationEntry())
        ? restoreDebugChannelOrReload(requestId)
        : getOrCreateDebugChannelReadableWriterPair(requestId).readable

      const reader = source.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) {
            controller.close()
            return
          }
          controller.enqueue(value)
        }
      } catch (error) {
        controller.error(error)
      } finally {
        reader.releaseLock()
      }
    },
  })
}
