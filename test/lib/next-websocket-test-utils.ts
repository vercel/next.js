import http from 'node:http'

import type { NextInstance } from 'e2e-utils'

export interface WebSocketUpgradeResponse {
  status: number
  headers: http.IncomingHttpHeaders
  body: string
}

export interface RequestWebSocketUpgradeOptions {
  /** Headers merged over the default WebSocket upgrade handshake. */
  headers?: http.OutgoingHttpHeaders
  /** Resolve with the status code only instead of the full response. */
  statusOnly?: boolean
  /**
   * Reject when the server answers with a 101 upgrade instead of an ordinary
   * HTTP response. By default a 101 resolves with an empty body.
   */
  rejectOnUpgrade?: boolean
  /** Destroys the request with an error when nothing answers in time. */
  timeoutMs?: number
}

/**
 * Issues a raw WebSocket upgrade handshake against the test server and settles
 * with the server's response, whether that is a 101 switch or an ordinary
 * HTTP error response.
 */
export function requestWebSocketUpgrade(
  next: NextInstance,
  requestPath: string,
  options: RequestWebSocketUpgradeOptions & { statusOnly: true }
): Promise<number>
export function requestWebSocketUpgrade(
  next: NextInstance,
  requestPath: string,
  options?: RequestWebSocketUpgradeOptions
): Promise<WebSocketUpgradeResponse>
export function requestWebSocketUpgrade(
  next: NextInstance,
  requestPath: string,
  options: RequestWebSocketUpgradeOptions = {}
): Promise<number | WebSocketUpgradeResponse> {
  const { headers, statusOnly, rejectOnUpgrade, timeoutMs } = options
  return new Promise<number | WebSocketUpgradeResponse>((resolve, reject) => {
    const request = http.request({
      host: 'localhost',
      port: next.appPort,
      path: requestPath,
      headers: {
        connection: 'Upgrade',
        upgrade: 'websocket',
        'sec-websocket-key': Buffer.alloc(16).toString('base64'),
        'sec-websocket-version': '13',
        ...headers,
      },
    })
    request.once('response', (response) => {
      response.resume()
      if (statusOnly) {
        response.once('end', () => resolve(response.statusCode!))
        return
      }
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.once('end', () => {
        resolve({
          status: response.statusCode!,
          headers: response.headers,
          body: Buffer.concat(chunks).toString(),
        })
      })
    })
    request.once('upgrade', (response, socket) => {
      socket.destroy()
      if (rejectOnUpgrade) {
        reject(
          new Error(
            `WebSocket upgrade request to ${requestPath} unexpectedly upgraded`
          )
        )
        return
      }
      if (statusOnly) {
        resolve(response.statusCode!)
        return
      }
      resolve({
        status: response.statusCode!,
        headers: response.headers,
        body: '',
      })
    })
    request.once('error', reject)
    if (timeoutMs !== undefined) {
      request.setTimeout(timeoutMs, () => {
        request.destroy(
          new Error(
            `WebSocket upgrade request to ${requestPath} did not return an HTTP response`
          )
        )
      })
    }
    request.end()
  })
}
