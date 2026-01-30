/**
 * WebSocket Bridge
 *
 * This module bridges the Web Streams-based NextWebSocket to actual Node.js
 * TCP sockets using the 'ws' library for WebSocket protocol handling.
 */

import type { IncomingMessage } from 'http'
import type { Duplex } from 'stream'
import type {
  WebSocketInternalMessage,
  WebSocketCloseMessage,
} from './spec-extension/websocket'

/**
 * Bridges a NextWebSocket (via its streams) to an actual Node.js socket.
 *
 * @param req - The original HTTP upgrade request
 * @param socket - The raw TCP socket from the upgrade event
 * @param head - The first packet of the upgraded stream (may be empty)
 * @param wsInternal - The internal streams from NextResponse.upgrade()
 */
export async function bridgeWebSocket(
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
  wsInternal: {
    readable: ReadableStream<
      string | ArrayBufferLike | Blob | ArrayBufferView | WebSocketCloseMessage
    >
    writable: WritableStream<WebSocketInternalMessage>
  }
): Promise<void> {
  // Dynamically import ws to avoid bundling issues
  const { WebSocketServer } =
    require('next/dist/compiled/ws') as typeof import('next/dist/compiled/ws')
  const wsServer = new WebSocketServer({ noServer: true })

  return new Promise((resolve, reject) => {
    // Cast socket to any since ws expects a net.Socket but we have a Duplex
    // This is safe because the Duplex is the socket from the HTTP upgrade
    wsServer.handleUpgrade(req, socket as any, head, (nodeWs) => {
      const writer = wsInternal.writable.getWriter()
      let closed = false

      const cleanup = () => {
        if (closed) return
        closed = true
        writer.close().catch(() => {
          // Ignore close errors
        })
        resolve()
      }

      // Forward messages from client (Node.js WebSocket) to user code (streams)
      nodeWs.on(
        'message',
        (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
          if (closed) return

          let messageData: string | ArrayBuffer
          if (Buffer.isBuffer(data)) {
            if (isBinary) {
              // Create a proper ArrayBuffer from the Buffer
              const arrayBuffer = new ArrayBuffer(data.byteLength)
              const view = new Uint8Array(arrayBuffer)
              for (let i = 0; i < data.byteLength; i++) {
                view[i] = data[i]
              }
              messageData = arrayBuffer
            } else {
              messageData = data.toString('utf-8')
            }
          } else if (Array.isArray(data)) {
            // Concatenate Buffer array
            const concatenated = Buffer.concat(data)
            if (isBinary) {
              const arrayBuffer = new ArrayBuffer(concatenated.byteLength)
              const view = new Uint8Array(arrayBuffer)
              for (let i = 0; i < concatenated.byteLength; i++) {
                view[i] = concatenated[i]
              }
              messageData = arrayBuffer
            } else {
              messageData = concatenated.toString('utf-8')
            }
          } else {
            messageData = data
          }

          const message: WebSocketInternalMessage = {
            type: 'message',
            data: messageData,
          }

          writer.write(message).catch((error) => {
            console.error('WebSocket bridge write error:', error)
            cleanup()
          })
        }
      )

      // Forward close from client to user code
      nodeWs.on('close', (code: number, reason: Buffer) => {
        if (closed) return

        const closeMessage: WebSocketInternalMessage = {
          type: 'close',
          code,
          reason: reason.toString('utf-8'),
        }

        writer
          .write(closeMessage)
          .catch(() => {
            // Ignore write errors during close
          })
          .finally(() => {
            cleanup()
          })
      })

      nodeWs.on('error', (error) => {
        console.error('WebSocket error:', error)
        cleanup()
        reject(error)
      })

      // Forward messages from user code (streams) to client (Node.js WebSocket)
      const reader = wsInternal.readable.getReader()

      const readLoop = async () => {
        try {
          while (!closed) {
            const { done, value } = await reader.read()

            if (done) {
              // Stream ended, close the WebSocket
              if (nodeWs.readyState === nodeWs.OPEN) {
                nodeWs.close(1000, 'Stream ended')
              }
              break
            }

            // Check if it's a close message
            if (
              typeof value === 'object' &&
              value !== null &&
              'type' in value &&
              (value as WebSocketCloseMessage).type === 'close'
            ) {
              const closeMsg = value as WebSocketCloseMessage
              if (nodeWs.readyState === nodeWs.OPEN) {
                nodeWs.close(closeMsg.code ?? 1000, closeMsg.reason ?? '')
              }
              break
            }

            // Send regular message
            if (nodeWs.readyState === nodeWs.OPEN) {
              // Handle different data types
              if (typeof value === 'string') {
                nodeWs.send(value)
              } else if (value instanceof ArrayBuffer) {
                nodeWs.send(Buffer.from(value))
              } else if (ArrayBuffer.isView(value)) {
                nodeWs.send(
                  Buffer.from(value.buffer, value.byteOffset, value.byteLength)
                )
              } else if (value instanceof Blob) {
                // Convert Blob to ArrayBuffer and send
                const arrayBuffer = await value.arrayBuffer()
                nodeWs.send(Buffer.from(arrayBuffer))
              } else {
                // Fallback: try to send as-is
                nodeWs.send(value as any)
              }
            }
          }
        } catch (error) {
          console.error('WebSocket bridge read error:', error)
          if (nodeWs.readyState === nodeWs.OPEN) {
            nodeWs.close(1011, 'Internal error')
          }
        } finally {
          reader.releaseLock()
          cleanup()
        }
      }

      // Start reading from user code
      readLoop()
    })
  })
}
