import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http'
import type { FetchMetrics } from './index'

import { toNodeOutgoingHttpHeaders } from '../web/utils'
import { BaseNextRequest, BaseNextResponse } from './index'
import { DetachedPromise } from '../../lib/detached-promise'
import type { NextRequestHint } from '../web/adapter'
import { CloseController, trackBodyConsumed } from '../web/web-on-close'

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

  private closeController = new CloseController()

  public statusCode: number | undefined
  public statusMessage: string | undefined

  constructor(
    public transformStream = new TransformStream(),
    private trackOnClose = false
  ) {
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

    const body = this.textBody ?? this.transformStream.readable

    let bodyInit: BodyInit = body

    const canAddListenersLater = typeof bodyInit !== 'string'
    const shouldTrackBody =
      this.trackOnClose &&
      (canAddListenersLater ? true : this.closeController.listeners > 0)

    if (shouldTrackBody) {
      bodyInit = trackBodyConsumed(body, () => {
        this.closeController.dispatchClose()
      })
    }

    return new Response(bodyInit, {
      headers: this.headers,
      status: this.statusCode,
      statusText: this.statusMessage,
    })
  }

  public onClose(callback: () => void) {
    if (!this.trackOnClose) {
      throw new Error(
        'Cannot call onClose on a WebNextResponse initialized with `trackOnClose = false`'
      )
    }
    if (this.sent) {
      throw new Error('Cannot call onClose on a response that is already sent')
    }
    return this.closeController.onClose(callback)
  }
}
