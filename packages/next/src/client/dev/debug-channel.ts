import { NEXT_REQUEST_ID_HEADER } from '../components/app-router-headers'
import { InvariantError } from '../../shared/lib/invariant-error'

export interface DebugChannelReadableWriterPair {
  readonly readable: ReadableStream<Uint8Array>
  readonly writer: WritableStreamDefaultWriter<Uint8Array>
}

const pairs = new Map<string, DebugChannelReadableWriterPair>()

const DEBUG_CHANNEL_STORAGE_KEY = '__next_debug_channel'

// Buffer for the initial document's debug channel data. Written to
// sessionStorage once complete so it can be restored when the browser serves
// the page from HTTP cache (back-forward navigation, tab duplication, etc.).
let initialDocumentDebugChunks: Uint8Array[] = []

function persistDebugChannelToSessionStorage(requestId: string): void {
  try {
    const chunks = initialDocumentDebugChunks.map((chunk) => {
      let binary = ''
      for (let i = 0; i < chunk.byteLength; i++) {
        binary += String.fromCharCode(chunk[i])
      }
      return btoa(binary)
    })

    sessionStorage.setItem(
      DEBUG_CHANNEL_STORAGE_KEY,
      JSON.stringify({ requestId, chunks })
    )
  } catch {
    // Quota exceeded or other error — skip silently. The location.reload()
    // fallback in createDebugChannel handles this case.
  }
}

function wasServedFromCache(): boolean {
  try {
    // There is exactly one PerformanceNavigationTiming entry per page load.
    const entry = performance.getEntriesByType('navigation')[0]

    return entry?.transferSize === 0
  } catch {
    return false
  }
}

function restoreDebugChannelFromSessionStorage(
  requestId: string
): ReadableStream<Uint8Array> | undefined {
  try {
    const serializedData = sessionStorage.getItem(DEBUG_CHANNEL_STORAGE_KEY)

    if (!serializedData) {
      return undefined
    }

    const parsedData = JSON.parse(serializedData) as {
      requestId: string
      chunks: string[]
    }

    if (parsedData.requestId !== requestId) {
      return undefined
    }

    const chunks = parsedData.chunks.map((base64) => {
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

    if (!readable) {
      // Debug channel can't be restored — debug deps would block hydration.
      // Force a fresh page load from the server.
      location.reload()
    }

    return { readable }
  }

  const { readable } = getOrCreateDebugChannelReadableWriterPair(requestId)

  return { readable }
}
