/**
 * NextWebSocket - A server-side WebSocket implementation for Next.js route handlers.
 *
 * This class implements the standard WebSocket interface and is designed to work
 * with Next.js route handlers via NextResponse.upgrade().
 *
 * @example
 * ```ts
 * import { NextResponse } from 'next/server'
 *
 * export const GET = async () => {
 *   const [socket, response] = NextResponse.upgrade()
 *
 *   socket.accept()
 *   socket.send("WELCOME")
 *
 *   socket.addEventListener("message", (event) => {
 *     socket.send("ECHO: " + event.data)
 *   })
 *
 *   return response
 * }
 * ```
 */

// Internal symbols
export const WEBSOCKET_READABLE = Symbol.for('next.websocket.readable')
export const WEBSOCKET_WRITABLE = Symbol.for('next.websocket.writable')
export const WEBSOCKET_INTERNAL = Symbol.for('next.websocket')

// Message types for internal communication
export interface WebSocketMessage {
  type: 'message'
  data: string | ArrayBuffer
}

export interface WebSocketCloseMessage {
  type: 'close'
  code?: number
  reason?: string
}

export type WebSocketInternalMessage = WebSocketMessage | WebSocketCloseMessage

/**
 * A server-side WebSocket that implements the standard WebSocket interface.
 */
export class NextWebSocket extends EventTarget implements WebSocket {
  // WebSocket readyState constants
  readonly CONNECTING = 0 as const
  readonly OPEN = 1 as const
  readonly CLOSING = 2 as const
  readonly CLOSED = 3 as const

  // WebSocket properties
  private _readyState: number = 0 // CONNECTING
  binaryType: BinaryType = 'blob'
  readonly bufferedAmount: number = 0
  readonly extensions: string = ''
  readonly protocol: string = ''
  readonly url: string = ''

  // Event handlers (for compatibility with WebSocket interface)
  onopen: ((this: WebSocket, ev: Event) => any) | null = null
  onmessage: ((this: WebSocket, ev: MessageEvent) => any) | null = null
  onclose: ((this: WebSocket, ev: CloseEvent) => any) | null = null
  onerror: ((this: WebSocket, ev: Event) => any) | null = null

  // Internal streams for communication
  private _readable: ReadableStream<WebSocketInternalMessage>
  private _writable: WritableStream<
    WebSocketInternalMessage | string | ArrayBufferLike | Blob | ArrayBufferView
  >
  private _writer: WritableStreamDefaultWriter<
    WebSocketInternalMessage | string | ArrayBufferLike | Blob | ArrayBufferView
  >
  private _accepted: boolean = false

  constructor(
    readable: ReadableStream<WebSocketInternalMessage>,
    writable: WritableStream<
      | WebSocketInternalMessage
      | string
      | ArrayBufferLike
      | Blob
      | ArrayBufferView
    >
  ) {
    super()
    this._readable = readable
    this._writable = writable
    this._writer = writable.getWriter()
  }

  get readyState(): number {
    return this._readyState
  }

  /**
   * Accepts the WebSocket connection. Must be called before sending messages.
   * This allows for pre-accept validation of the connection.
   */
  accept(): void {
    if (this._accepted) {
      throw new DOMException(
        'WebSocket has already been accepted',
        'InvalidStateError'
      )
    }
    if (this._readyState !== this.CONNECTING) {
      throw new DOMException(
        'WebSocket is not in CONNECTING state',
        'InvalidStateError'
      )
    }

    this._accepted = true
    this._readyState = this.OPEN

    // Dispatch open event
    const openEvent = new Event('open')
    this.dispatchEvent(openEvent)
    this.onopen?.call(this as unknown as WebSocket, openEvent)

    // Start reading messages from the client
    this._startReading()
  }

  /**
   * Sends data through the WebSocket connection.
   */
  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this._readyState === this.CONNECTING) {
      throw new DOMException(
        'WebSocket is still in CONNECTING state. Call accept() first.',
        'InvalidStateError'
      )
    }
    if (this._readyState !== this.OPEN) {
      throw new DOMException('WebSocket is not open', 'InvalidStateError')
    }

    // Write data to the stream
    this._writer.write(data).catch((error) => {
      // Handle write errors
      console.error('WebSocket send error:', error)
    })
  }

  /**
   * Closes the WebSocket connection.
   */
  close(code?: number, reason?: string): void {
    if (this._readyState === this.CLOSING || this._readyState === this.CLOSED) {
      return
    }

    // Validate close code
    if (code !== undefined) {
      if (code !== 1000 && (code < 3000 || code > 4999)) {
        throw new DOMException(
          `Invalid close code: ${code}. Must be 1000 or in range 3000-4999.`,
          'InvalidAccessError'
        )
      }
    }

    // Validate reason length
    if (reason !== undefined) {
      const encoder = new TextEncoder()
      if (encoder.encode(reason).length > 123) {
        throw new DOMException(
          'Close reason is too long (max 123 bytes)',
          'SyntaxError'
        )
      }
    }

    this._readyState = this.CLOSING

    // Send close message
    const closeMessage: WebSocketCloseMessage = {
      type: 'close',
      code: code ?? 1000,
      reason: reason ?? '',
    }

    this._writer
      .write(closeMessage)
      .then(() => {
        this._writer.close().catch(() => {
          // Ignore close errors
        })
      })
      .catch(() => {
        // Ignore write errors during close
      })
  }

  /**
   * Reads messages from the client and dispatches events.
   */
  private async _startReading(): Promise<void> {
    const reader = this._readable.getReader()

    try {
      while (true) {
        const { done, value } = await reader.read()

        if (done) {
          break
        }

        if (value.type === 'close') {
          this._readyState = this.CLOSED
          const closeEvent = new CloseEvent('close', {
            code: value.code ?? 1000,
            reason: value.reason ?? '',
            wasClean: true,
          })
          this.dispatchEvent(closeEvent)
          this.onclose?.call(this as unknown as WebSocket, closeEvent)
          break
        }

        if (value.type === 'message') {
          const messageEvent = new MessageEvent('message', {
            data: value.data,
          })
          this.dispatchEvent(messageEvent)
          this.onmessage?.call(this as unknown as WebSocket, messageEvent)
        }
      }
    } catch (error) {
      // Handle read errors
      const errorEvent = new Event('error')
      this.dispatchEvent(errorEvent)
      this.onerror?.call(this as unknown as WebSocket, errorEvent)
    } finally {
      if (this._readyState !== this.CLOSED) {
        this._readyState = this.CLOSED
        const closeEvent = new CloseEvent('close', {
          code: 1006,
          reason: 'Connection closed abnormally',
          wasClean: false,
        })
        this.dispatchEvent(closeEvent)
        this.onclose?.call(this as unknown as WebSocket, closeEvent)
      }
    }
  }
}

/**
 * Creates a pair of connected streams for WebSocket communication.
 * Returns a NextWebSocket and the corresponding streams for the bridge.
 */
export function createWebSocketPair(): {
  socket: NextWebSocket
  readable: ReadableStream<
    string | ArrayBufferLike | Blob | ArrayBufferView | WebSocketCloseMessage
  >
  writable: WritableStream<WebSocketInternalMessage>
} {
  // Streams for client -> server communication (messages from client)
  let clientToServerController: ReadableStreamDefaultController<WebSocketInternalMessage>
  const clientToServerReadable = new ReadableStream<WebSocketInternalMessage>({
    start(controller) {
      clientToServerController = controller
    },
  })

  // Streams for server -> client communication (messages from server)
  let serverToClientController: ReadableStreamDefaultController<
    string | ArrayBufferLike | Blob | ArrayBufferView | WebSocketCloseMessage
  >
  const serverToClientReadable = new ReadableStream<
    string | ArrayBufferLike | Blob | ArrayBufferView | WebSocketCloseMessage
  >({
    start(controller) {
      serverToClientController = controller
    },
  })

  // Writable for the bridge to send messages to the server (user code)
  const clientToServerWritable = new WritableStream<WebSocketInternalMessage>({
    write(chunk) {
      clientToServerController.enqueue(chunk)
    },
    close() {
      clientToServerController.close()
    },
  })

  // Writable for the server (user code) to send messages to the client
  const serverToClientWritable = new WritableStream<
    WebSocketInternalMessage | string | ArrayBufferLike | Blob | ArrayBufferView
  >({
    write(chunk) {
      // Handle different message types
      if (typeof chunk === 'object' && chunk !== null && 'type' in chunk) {
        // It's an internal message (close message)
        serverToClientController.enqueue(chunk as WebSocketCloseMessage)
      } else {
        // It's raw data (string, ArrayBuffer, etc.)
        serverToClientController.enqueue(
          chunk as string | ArrayBufferLike | Blob | ArrayBufferView
        )
      }
    },
    close() {
      serverToClientController.close()
    },
  })

  // Create the NextWebSocket that user code will interact with
  const socket = new NextWebSocket(
    clientToServerReadable,
    serverToClientWritable
  )

  return {
    socket,
    readable: serverToClientReadable, // Bridge reads from this to send to client
    writable: clientToServerWritable, // Bridge writes to this from client messages
  }
}
