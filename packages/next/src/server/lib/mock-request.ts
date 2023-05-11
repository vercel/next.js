import type {
  ServerResponse,
  OutgoingHttpHeaders,
  OutgoingHttpHeader,
  IncomingMessage,
  IncomingHttpHeaders,
} from 'http'
import type { Socket } from 'net'
import type { TLSSocket } from 'tls'

import Stream from 'stream'
import { toNodeHeaders } from '../web/utils'

interface MockedRequestOptions {
  url: string
  headers: IncomingHttpHeaders
  method: string
  socket?: Socket | null
}

export class MockedRequest extends Stream.Readable implements IncomingMessage {
  public url: string
  public readonly statusCode?: number | undefined
  public readonly statusMessage?: string | undefined
  public readonly headers: IncomingHttpHeaders
  public readonly method: string

  // This is hardcoded for now, but can be updated to be configurable if needed.
  public readonly httpVersion = '1.0'
  public readonly httpVersionMajor = 1
  public readonly httpVersionMinor = 0

  // If we don't actually have a socket, we'll just use a mock one that
  // always returns false for the `encrypted` property.
  public socket: Socket = new Proxy<TLSSocket>({} as TLSSocket, {
    get: (_target, prop) => {
      if (prop !== 'encrypted') {
        throw new Error('Method not implemented')
      }

      // For this mock request, always ensure we just respond with the encrypted
      // set to false to ensure there's no odd leakages.
      return false
    },
  })

  constructor({ url, headers, method, socket = null }: MockedRequestOptions) {
    super()

    this.url = url
    this.headers = headers
    this.method = method

    if (socket) {
      this.socket = socket
    }
  }

  public _read(): void {
    this.emit('end')
    this.emit('close')
  }

  /**
   * The `connection` property is just an alias for the `socket` property.
   *
   * @deprecated — since v13.0.0 - Use socket instead.
   */
  public get connection(): Socket {
    return this.socket
  }

  // The following methods are not implemented as they are not used in the
  // Next.js codebase.

  public get aborted(): boolean {
    throw new Error('Method not implemented')
  }

  public get complete(): boolean {
    throw new Error('Method not implemented')
  }

  public get trailers(): NodeJS.Dict<string> {
    throw new Error('Method not implemented')
  }

  public get rawTrailers(): string[] {
    throw new Error('Method not implemented')
  }

  public get rawHeaders(): string[] {
    throw new Error('Method not implemented.')
  }

  public setTimeout(): this {
    throw new Error('Method not implemented.')
  }
}

interface MockedResponseOptions {
  socket?: Socket | null
}

export class MockedResponse extends Stream.Writable implements ServerResponse {
  public statusCode: number = 200
  public statusMessage: string = ''
  public readonly finished = false
  public readonly headersSent = false
  public readonly socket: Socket | null

  /**
   * A promise that resolves to `true` when the response has been streamed.
   */
  public readonly hasStreamed: Promise<boolean>

  /**
   * A list of buffers that have been written to the response.
   */
  public readonly buffers: Buffer[] = []

  private readonly headers = new Headers()

  constructor({ socket = null }: MockedResponseOptions) {
    super()

    this.socket = socket

    // Attach listeners for the `finish`, `end`, and `error` events to the
    // `MockedResponse` instance.
    this.hasStreamed = new Promise<boolean>((resolve, reject) => {
      this.on('finish', () => resolve(true))
      this.on('end', () => resolve(true))
      this.on('error', (err) => reject(err))
    })
  }

  /**
   * The `connection` property is just an alias for the `socket` property.
   *
   * @deprecated — since v13.0.0 - Use socket instead.
   */
  public get connection(): Socket | null {
    return this.socket
  }

  public write(chunk: Buffer | string) {
    this.buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))

    return true
  }

  /**
   * This method is a no-op because the `MockedResponse` instance is not
   * actually connected to a socket. This method is not specified on the
   * interface type for `ServerResponse` but is called by Node.js.
   *
   * @see https://github.com/nodejs/node/pull/7949
   */
  public _implicitHeader() {}

  public _write(
    chunk: Buffer | string,
    _encoding: string,
    callback: () => void
  ) {
    this.write(chunk)

    // According to Node.js documentation, the callback MUST be invoked to
    // signal that the write completed successfully. If this callback is not
    // invoked, the 'finish' event will not be emitted.
    //
    // https://nodejs.org/docs/latest-v16.x/api/stream.html#writable_writechunk-encoding-callback
    callback()
  }

  public writeHead(
    statusCode: number,
    statusMessage?: string | undefined,
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined
  ): this
  public writeHead(
    statusCode: number,
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined
  ): this
  public writeHead(
    statusCode: number,
    statusMessage?:
      | string
      | OutgoingHttpHeaders
      | OutgoingHttpHeader[]
      | undefined,
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined
  ): this {
    if (!headers && typeof statusMessage !== 'string') {
      headers = statusMessage
    } else if (typeof statusMessage === 'string' && statusMessage.length > 0) {
      this.statusMessage = statusMessage
    }

    if (headers) {
      // When headers have been set with response.setHeader(), they will be
      // merged with any headers passed to response.writeHead(), with the
      // headers passed to response.writeHead() given precedence.
      //
      // https://nodejs.org/api/http.html#responsewriteheadstatuscode-statusmessage-headers
      //
      // For this reason, we need to only call `set` to ensure that this will
      // overwrite any existing headers.
      if (Array.isArray(headers)) {
        // headers may be an Array where the keys and values are in the same list.
        // It is not a list of tuples. So, the even-numbered offsets are key
        // values, and the odd-numbered offsets are the associated values. The
        // array is in the same format as request.rawHeaders.
        for (let i = 0; i < headers.length; i += 2) {
          // The header key is always a string according to the spec.
          this.setHeader(headers[i] as string, headers[i + 1])
        }
      } else {
        for (const [key, value] of Object.entries(headers)) {
          // Skip undefined values
          if (typeof value === 'undefined') continue

          this.setHeader(key, value)
        }
      }
    }

    this.statusCode = statusCode

    return this
  }

  public hasHeader(name: string): boolean {
    return this.headers.has(name)
  }

  public getHeader(name: string): string | undefined {
    return this.headers.get(name) ?? undefined
  }

  public getHeaders(): OutgoingHttpHeaders {
    return toNodeHeaders(this.headers)
  }

  public getHeaderNames(): string[] {
    return Array.from(this.headers.keys())
  }

  public setHeader(name: string, value: OutgoingHttpHeader): void {
    if (Array.isArray(value)) {
      // Because `set` here should override any existing values, we need to
      // delete the existing values before setting the new ones via `append`.
      this.headers.delete(name)

      for (const v of value) {
        this.headers.append(name, v)
      }
    } else if (typeof value === 'number') {
      this.headers.set(name, value.toString())
    } else {
      this.headers.set(name, value)
    }
  }

  public removeHeader(name: string): void {
    this.headers.delete(name)
  }

  // The following methods are not implemented as they are not used in the
  // Next.js codebase.

  public assignSocket() {
    throw new Error('Method not implemented.')
  }

  public detachSocket(): void {
    throw new Error('Method not implemented.')
  }

  public writeContinue(): void {
    throw new Error('Method not implemented.')
  }

  public writeProcessing(): void {
    throw new Error('Method not implemented.')
  }

  public get upgrading(): boolean {
    throw new Error('Method not implemented.')
  }

  public get chunkedEncoding(): boolean {
    throw new Error('Method not implemented.')
  }

  public get shouldKeepAlive(): boolean {
    throw new Error('Method not implemented.')
  }

  public get useChunkedEncodingByDefault(): boolean {
    throw new Error('Method not implemented.')
  }

  public get sendDate(): boolean {
    throw new Error('Method not implemented.')
  }

  public setTimeout(): this {
    throw new Error('Method not implemented.')
  }

  public addTrailers(): void {
    throw new Error('Method not implemented.')
  }

  public flushHeaders(): void {
    throw new Error('Method not implemented.')
  }
}

interface RequestResponseMockerOptions {
  url: string
  headers?: IncomingHttpHeaders
  method?: string
  socket?: Socket | null
}

export function createRequestResponseMocks({
  url,
  headers = {},
  method = 'GET',
  socket = null,
}: RequestResponseMockerOptions) {
  return {
    req: new MockedRequest({ url, headers, method, socket }),
    res: new MockedResponse({ socket }),
  }
}
