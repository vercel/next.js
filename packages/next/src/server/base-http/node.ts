import type { ServerResponse, IncomingMessage } from 'http'
import type { Writable, Readable } from 'stream'

import { SYMBOL_CLEARED_COOKIES } from '../api-utils'
import type { NextApiRequestCookies } from '../api-utils'

import { NEXT_REQUEST_META } from '../request-meta'
import type { RequestMeta } from '../request-meta'

import { BaseNextRequest, BaseNextResponse } from './index'
import type { OutgoingHttpHeaders } from 'node:http'

type Req = IncomingMessage & {
  [NEXT_REQUEST_META]?: RequestMeta
  cookies?: NextApiRequestCookies
}

export class NodeNextRequest extends BaseNextRequest<Readable> {
  public headers = this._req.headers;

  [NEXT_REQUEST_META]: RequestMeta = this._req[NEXT_REQUEST_META] || {}

  get originalRequest() {
    // Need to mimic these changes to the original req object for places where we use it:
    // render.tsx, api/ssg requests
    this._req[NEXT_REQUEST_META] = this[NEXT_REQUEST_META]
    this._req.url = this.url
    this._req.cookies = this.cookies
    return this._req
  }

  set originalRequest(value: Req) {
    this._req = value
  }

  constructor(private _req: Req) {
    super(_req.method!.toUpperCase(), _req.url!, _req)
  }
}

export class NodeNextResponse extends BaseNextResponse<Writable> {
  private textBody: string | undefined = undefined

  public [SYMBOL_CLEARED_COOKIES]?: boolean

  get originalResponse() {
    if (SYMBOL_CLEARED_COOKIES in this) {
      this._res[SYMBOL_CLEARED_COOKIES] = this[SYMBOL_CLEARED_COOKIES]
    }

    return this._res
  }

  constructor(
    private _res: ServerResponse & { [SYMBOL_CLEARED_COOKIES]?: boolean }
  ) {
    super(_res)
  }

  get sent() {
    return this._res.finished || this._res.headersSent
  }

  get statusCode() {
    return this._res.statusCode
  }

  set statusCode(value: number) {
    this._res.statusCode = value
  }

  get statusMessage() {
    return this._res.statusMessage
  }

  set statusMessage(value: string) {
    this._res.statusMessage = value
  }

  setHeader(name: string, value: string | string[]): this {
    this._res.setHeader(name, value)
    return this
  }

  removeHeader(name: string): this {
    this._res.removeHeader(name)
    return this
  }

  getHeaderValues(name: string): string[] | undefined {
    const values = this._res.getHeader(name)

    if (values === undefined) return undefined

    return (Array.isArray(values) ? values : [values]).map((value) =>
      value.toString()
    )
  }

  hasHeader(name: string): boolean {
    return this._res.hasHeader(name)
  }

  getHeader(name: string): string | undefined {
    const values = this.getHeaderValues(name)
    return Array.isArray(values) ? values.join(',') : undefined
  }

  getHeaders(): OutgoingHttpHeaders {
    return this._res.getHeaders()
  }

  appendHeader(name: string, value: string): this {
    const currentValues = this.getHeaderValues(name) ?? []

    if (!currentValues.includes(value)) {
      this._res.setHeader(name, [...currentValues, value])
    }

    return this
  }

  body(value: string) {
    this.textBody = value
    return this
  }

  send() {
    this._res.end(this.textBody)
  }
}
