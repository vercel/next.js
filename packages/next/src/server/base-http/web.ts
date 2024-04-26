import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http'
import type { FetchMetrics } from './index'

import { toNodeOutgoingHttpHeaders } from '../web/utils'
import { BaseNextRequest, BaseNextResponse } from './index'
import { DetachedPromise } from '../../lib/detached-promise'
import type { NextRequestHint } from '../web/adapter'

export class WebNextRequest extends BaseNextRequest<ReadableStream | null> {
  public request: Request
  public headers: IncomingHttpHeaders
  public fetchMetrics?: FetchMetrics

  constructor(request: NextRequestHint) {
    const url = new URL(request.url)

    super(
      request.method,
      url.href.slice(url.origin.length),
      request.clone().body
    )
    this.request = request
    this.fetchMetrics = request.fetchMetrics

    this.headers = {}
    for (const [name, value] of request.headers.entries()) {
      this.headers[name] = value
    }
  }

  async parseBody(_limit: string | number): Promise<any> {
    throw new Error('parseBody is not implemented in the web runtime')
  }
}

export class WebNextResponse extends BaseNextResponse<WritableStream> {
  private headers = new Headers()
  private textBody: string | undefined = undefined

  private listeners = 0
  private target = new EventTarget()

  public statusCode: number | undefined
  public statusMessage: string | undefined

  constructor(public transformStream = new TransformStream()) {
    super(transformStream.writable)
  }

  setHeader(name: string, value: string | string[]): this {
    this.headers.delete(name)
    for (const val of Array.isArray(value) ? value : [value]) {
      this.headers.append(name, val)
    }
    return this
  }

  removeHeader(name: string): this {
    this.headers.delete(name)
    return this
  }

  getHeaderValues(name: string): string[] | undefined {
    // https://developer.mozilla.org/docs/Web/API/Headers/get#example
    return this.getHeader(name)
      ?.split(',')
      .map((v) => v.trimStart())
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name) ?? undefined
  }

  getHeaders(): OutgoingHttpHeaders {
    return toNodeOutgoingHttpHeaders(this.headers)
  }

  hasHeader(name: string): boolean {
    return this.headers.has(name)
  }

  appendHeader(name: string, value: string): this {
    this.headers.append(name, value)
    return this
  }

  body(value: string) {
    this.textBody = value
    return this
  }

  private readonly sendPromise = new DetachedPromise<void>()

  private _sent = false
  public send() {
    this.sendPromise.resolve()
    this._sent = true
  }

  get sent() {
    return this._sent
  }

  public async toResponse() {
    // If we haven't called `send` yet, wait for it to be called.
    if (!this.sent) await this.sendPromise.promise

    let body = this.textBody ?? this.transformStream.readable

    if (this.listeners > 0) {
      body = trackBodyConsumed(body, () => {
        this.target.dispatchEvent(new Event('close'))
      })
    }

    return new Response(body, {
      headers: this.headers,
      status: this.statusCode,
      statusText: this.statusMessage,
    })
  }

  public onClose(callback: () => void) {
    if (this.sent) {
      throw new Error('Cannot call onClose on a response that is already sent')
    }
    this.target.addEventListener('close', callback)
    this.listeners++
    return () => {
      this.target.removeEventListener('close', callback)
      this.listeners--
    }
  }
}

function trackBodyConsumed(body: string | ReadableStream, onEnd: () => void) {
  // monitor when the consumer finishes reading the response body.
  // that's as close as we can get to `res.on('close')` using web APIs.

  if (typeof body === 'string') {
    // TODO(after): how much overhead does this introduce?
    return new ReadableStream({
      pull(controller) {
        const encoder = new TextEncoder()
        controller.enqueue(encoder.encode(body))
        controller.close()
        return onEnd()
      },
    })
  } else {
    const closePassThrough = new TransformStream({
      flush: () => {
        return onEnd()
      },
    })
    return body.pipeThrough(closePassThrough)
  }
}
