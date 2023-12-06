import type * as stream from 'node:stream'

declare module 'node:stream' {
  interface Duplex {
    [REQUEST_UPGRADED]?: boolean
    _httpMessage?: {
      _headerSent?: boolean
    }
  }
}

const REQUEST_UPGRADED = Symbol('REQUEST_UPGRADED')

export function markSocketUpgraded(socket: stream.Duplex) {
  socket[REQUEST_UPGRADED] = true
}

export function isSocketUpgraded(socket: stream.Duplex) {
  return socket[REQUEST_UPGRADED]
}

const badRequestResponse = Buffer.from(
  `HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n`,
  'ascii'
)
const requestTimeoutResponse = Buffer.from(
  `HTTP/1.1 408 Request Timeout\r\nConnection: close\r\n\r\n`,
  'ascii'
)
const requestHeaderFieldsTooLargeResponse = Buffer.from(
  `HTTP/1.1 431 Request Header Fields Too Large\r\nConnection: close\r\n\r\n`,
  'ascii'
)

/**
 * Allow a socket to be upgraded without triggering an HTTP request timeout response.
 *
 * We work around the behavior of the Node.js HTTP server which incorrectly detects an upgraded
 * request as expiring. We preserve the default behavior of Node with its existing error handling.
 *
 * See: https://github.com/nodejs/node/blob/v20.10.0/lib/_http_server.js#L873-L907
 */
export function handleClientError(
  e: NodeJS.ErrnoException,
  socket: stream.Duplex
) {
  if (isSocketUpgraded(socket)) {
    return
  }

  // Begin Node.js implementation:
  if (
    socket.writable &&
    (!socket?._httpMessage || !socket?._httpMessage?._headerSent)
  ) {
    let response

    switch (e.code) {
      case 'HPE_HEADER_OVERFLOW':
        response = requestHeaderFieldsTooLargeResponse
        break
      case 'ERR_HTTP_REQUEST_TIMEOUT':
        response = requestTimeoutResponse
        break
      default:
        response = badRequestResponse
        break
    }

    socket.write(response)
  }
  socket.destroy(e)
}
