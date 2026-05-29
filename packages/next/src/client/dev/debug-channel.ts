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

function wasServedFromCache(): boolean {
  try {
    // There is exactly one PerformanceNavigationTiming entry per page load.
    const entry = performance.getEntriesByType('navigation')[0]

    if (!entry) {
      return false
    }

    // HTTP cache restore detection isn't uniform across browsers, so we combine
    // two signals:
    //
    //   1. type === 'back_forward' — set on browser-history navigations
    //      (back/forward) in all three browsers, and on tab duplication in
    //      Chrome and Firefox. This only matters when scripts actually
    //      re-execute; a bfcache restore preserves the entire JS context and
    //      never reaches this code. The HMR WebSocket disqualifies bfcache in
    //      Chrome and Firefox, so back/forward falls back to an HTTP cache
    //      restore and we land here with this type set. Safari is more lenient
    //      and often still uses bfcache for back/forward despite the WebSocket,
    //      in which case this function isn't called and no recovery is needed.
    //   2. responseStart === 0 && responseEnd > 0 — Safari uses type='navigate'
    //      on tab duplication. It sets responseStart to 0 when no
    //      first-body-byte arrived over the network; fresh loads always have
    //      responseStart > 0.
    //
    // Neither fires on Firefox's fresh streaming load, where transferSize is
    // transiently 0. That case has type='navigate' with a non-zero
    // responseStart, so it correctly returns false and avoids a
    // location.reload() loop that earlier (transferSize-only) versions of this
    // check triggered.
    return (
      entry.type === 'back_forward' ||
      (entry.responseStart === 0 && entry.responseEnd > 0)
    )
  } catch {
    return false
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
  if (!requestHeaders && wasServedFromCache()) {
    const readable = restoreDebugChannelFromSessionStorage(requestId)

    if (readable) {
      return { readable }
    }

    // Debug channel can't be restored — debug deps would block hydration.
    // Force a fresh page load from the server. Return a never-closing stream
    // so the Flight client stays parked until the reload tears the document
    // down, instead of synchronously erroring with "Connection closed.".
    location.reload()
    return { readable: new ReadableStream() }
  }

  const { readable } = getOrCreateDebugChannelReadableWriterPair(requestId)

  return { readable }
}
