import type { IncomingMessage as NodeIncomingMessage } from 'http'
import { ReadableStream } from 'next/dist/compiled/web-streams-polyfill'
import { PassThrough } from 'stream'

class IncomingMessage extends PassThrough implements NodeIncomingMessage {
  #original: NodeIncomingMessage

  constructor(original: NodeIncomingMessage) {
    super()
    this.#original = original
  }

  get httpVersion() {
    return this.#original.httpVersion
  }

  get httpVersionMajor() {
    return this.#original.httpVersionMajor
  }

  get httpVersionMinor() {
    return this.#original.httpVersionMinor
  }

  get complete() {
    return this.#original.complete
  }

  get connection() {
    return this.#original.connection
  }

  get socket() {
    return this.#original.socket
  }

  get headers() {
    return this.#original.headers
  }

  get rawHeaders() {
    return this.#original.rawHeaders
  }

  get trailers() {
    return this.#original.trailers
  }

  get rawTrailers() {
    return this.#original.rawTrailers
  }

  setTimeout(msecs: number, callback?: () => void) {
    this.#original.setTimeout(msecs, callback)
    return this
  }

  get method() {
    return this.#original.method
  }

  get url() {
    return this.#original.url
  }

  get statusCode() {
    return this.#original.statusCode
  }

  get statusMessage() {
    return this.#original.statusMessage
  }

  destroy(error?: Error) {
    this.#original.destroy(error)
  }
}

export function setReadableStream(original: NodeIncomingMessage) {
  if (!original.method || !['POST', 'PUT', 'PATCH'].includes(original.method)) {
    return original
  }

  const request = new IncomingMessage(original)
  const passthrough = new PassThrough()

  original.pipe(request)
  original.pipe(passthrough)
  ;(request as any).__readable = new ReadableStream({
    async start(controller) {
      for await (const chunk of passthrough) {
        controller.enqueue(chunk)
      }

      controller.close()
    },
  })

  return request
}
