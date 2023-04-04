import type {
  ServerResponse,
  OutgoingHttpHeaders,
  OutgoingHttpHeader,
  IncomingMessage,
  IncomingHttpHeaders,
} from 'http'
import type { Socket } from 'net'

import Stream from 'stream'
import { toNodeHeaders } from '../web/utils'

interface MockRequestResult {
  req: MockedRequest
  res: MockedResponse
  resBuffers: Buffer[]
  streamPromise: Promise<boolean>
}

class MockedRequest extends Stream.Writable implements IncomingMessage {
  public readonly statusCode?: number | undefined
  public readonly statusMessage?: string | undefined

  constructor(
    public url: string,
    public readonly headers: IncomingHttpHeaders,
    public readonly method: string,
    public readonly _connection: Socket | null = null
  ) {
    super()
  }

  public _read(): void {
    this.emit('end')
    this.emit('close')
  }

  public get connection(): Socket {
    if (!this._connection) {
      throw new Error('No connection available')
    }

    return this._connection
  }

  public get socket(): Socket {
    return this.connection
  }

  public get aborted(): boolean {
    throw new Error('Method not implemented')
  }

  public get httpVersion(): string {
    throw new Error('Method not implemented')
  }

  public get httpVersionMajor(): number {
    throw new Error('Method not implemented')
  }

  public get httpVersionMinor(): number {
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

  public get readable(): boolean {
    throw new Error('Method not implemented')
  }

  public get readableEncoding(): BufferEncoding | null {
    throw new Error('Method not implemented')
  }

  public get readableEnded(): boolean {
    throw new Error('Method not implemented')
  }

  public get readableFlowing(): boolean | null {
    throw new Error('Method not implemented')
  }

  public get readableHighWaterMark(): number {
    throw new Error('Method not implemented')
  }

  public get readableLength(): number {
    throw new Error('Method not implemented')
  }

  public get readableObjectMode(): boolean {
    throw new Error('Method not implemented')
  }

  public get rawHeaders(): string[] {
    throw new Error('Method not implemented.')
  }

  public read() {
    throw new Error('Method not implemented.')
  }

  public setEncoding(): this {
    throw new Error('Method not implemented.')
  }

  public pause(): this {
    throw new Error('Method not implemented.')
  }

  public resume(): this {
    throw new Error('Method not implemented.')
  }

  public isPaused(): boolean {
    throw new Error('Method not implemented.')
  }

  public unpipe(): this {
    throw new Error('Method not implemented.')
  }

  public unshift(): void {
    throw new Error('Method not implemented.')
  }

  public wrap(): this {
    throw new Error('Method not implemented.')
  }

  public push(): boolean {
    throw new Error('Method not implemented.')
  }

  public setTimeout(): this {
    throw new Error('Method not implemented.')
  }

  public [Symbol.asyncIterator](): AsyncIterableIterator<any> {
    throw new Error('Method not implemented.')
  }
}

class MockedResponse extends Stream.Writable implements ServerResponse {
  public statusCode: number = 200
  public statusMessage: string = ''
  public finished = false

  public readonly stream: Promise<boolean>
  public readonly buffers: Buffer[] = []

  private readonly headers = new Headers()

  constructor(public readonly connection: Socket | null = null) {
    super()

    // Attach listeners for the `finish`, `end`, and `error` events to the
    // `MockedResponse` instance.
    this.stream = new Promise<boolean>((resolve, reject) => {
      this.on('finish', () => resolve(true))
      this.on('end', () => resolve(true))
      this.on('error', (err) => reject(err))
    })
  }

  public write(chunk: Buffer | string) {
    this.buffers.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))

    return true
  }

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

  private hasHeadersBeenSent = false

  public writeHead(
    statusCode: number,
    reasonPhrase?: string | undefined,
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined
  ): this
  public writeHead(
    statusCode: number,
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[] | undefined
  ): this
  public writeHead(
    statusCode: number,
    reasonPhrase?: unknown,
    headers?: unknown
  ): this {
    this.hasHeadersBeenSent = true

    if (!headers && reasonPhrase) {
      headers = reasonPhrase
    }

    if (headers) {
      // headers may be an Array where the keys and values are in the same list.
      // It is not a list of tuples. So, the even-numbered offsets are key
      // values, and the odd-numbered offsets are the associated values. The
      // array is in the same format as request.rawHeaders.
      if (Array.isArray(headers)) {
        for (let i = 0; i < headers.length; i += 2) {
          this.headers.append(headers[i], headers[i + 1])
        }
      } else {
        for (const [key, value] of Object.entries(headers)) {
          if (Array.isArray(value)) {
            for (const v of value) {
              this.headers.append(key, v)
            }
          } else {
            this.headers.append(key, value)
          }
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

  public setHeader(name: string, value: string | string[]): void {
    if (Array.isArray(value)) {
      this.headers.delete(name)

      for (const v of value) {
        this.headers.append(name, v)
      }
    } else {
      this.headers.set(name, value)
    }
  }

  public removeHeader(name: string): void {
    this.headers.delete(name)
  }

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

  public get headersSent(): boolean {
    return this.hasHeadersBeenSent
  }

  public get socket(): Socket | null {
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

export function mockRequest(
  requestUrl: string,
  requestHeaders: Record<string, string | string[] | undefined>,
  requestMethod: string,
  requestConnection: Socket | null = null
): MockRequestResult {
  const req = new MockedRequest(
    requestUrl,
    requestHeaders,
    requestMethod,
    requestConnection
  )

  const res = new MockedResponse(requestConnection)

  return {
    req,
    res,
    resBuffers: res.buffers,
    streamPromise: res.stream,
  }
}
