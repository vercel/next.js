import type { IncomingHttpHeaders } from 'http'

import { BaseNextRequest, BaseNextResponse } from './index'

export class WebNextRequest extends BaseNextRequest<ReadableStream | null> {
  public request: Request
  public headers: IncomingHttpHeaders

  constructor(request: Request) {
    const url = new URL(request.url)

    super(
      request.method,
      url.href.slice(url.origin.length),
      request.clone().body
    )
    this.request = request

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
  private _sent = false

  private sendPromise = new Promise<void>((resolve) => {
    this.sendResolve = resolve
  })
  private sendResolve?: () => void
  private response = this.sendPromise.then(() => {
    return new Response(this.textBody ?? this.transformStream.readable, {
      headers: this.headers,
      status: this.statusCode,
      statusText: this.statusMessage,
    })
  })

  public statusCode: number | undefined
  public statusMessage: string | undefined

  get sent() {
    return this._sent
  }

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

  getHeaderValues(name: string): string[] | undefined {
    // https://developer.mozilla.org/en-US/docs/Web/API/Headers/get#example
    return this.getHeader(name)
      ?.split(',')
      .map((v) => v.trimStart())
  }

  getHeader(name: string): string | undefined {
    return this.headers.get(name) ?? undefined
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

  send() {
    this.sendResolve?.()
    this._sent = true
  }

  toResponse() {
    return this.response
  }
}
