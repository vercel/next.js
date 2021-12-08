import type { ServerResponse, IncomingMessage } from 'http'
import type { Writable, Readable } from 'stream'
import { parseNextUrl } from '../dist/shared/lib/router/utils/parse-next-url'
import { PERMANENT_REDIRECT_STATUS } from '../shared/lib/constants'
import { ParsedNextUrl } from '../shared/lib/router/utils/parse-next-url'
import { parseBody } from './api-utils'
import { I18NConfig } from './config-shared'

export interface BaseNextRequestConfig {
  basePath: string | undefined
  i18n?: I18NConfig
  trailingSlash?: boolean | undefined
}

interface RequestMeta {
  // interface from `server/request-meta.ts`
}

export abstract class BaseNextRequest<Body> {
  constructor(
    public url: string,
    public method: string,
    public body: Body,
    public config: BaseNextRequestConfig
  ) {}

  abstract parseBody(limit: string | number): Promise<any>

  abstract getHeader(name: string): string | string[] | undefined

  abstract getAllHeaders(): Record<string, string | string[]>

  // Utils implemented using the abstract methods above

  public nextUrl: ParsedNextUrl = parseNextUrl({
    headers: this.getAllHeaders(),
    nextConfig: this.config,
    url: this.url,
  })

  public meta: RequestMeta = {}
}

class NodeNextRequest extends BaseNextRequest<Readable> {
  constructor(public req: IncomingMessage, config: BaseNextRequestConfig) {
    super(req.url!, req.method!.toUpperCase(), req, config)
  }

  async parseBody(limit: string | number): Promise<any> {
    return parseBody(this.req, limit)
  }

  getHeader(name: string): string | string[] | undefined {
    return this.req.headers[name]
  }

  getAllHeaders(): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {}

    for (const [name, value] of Object.entries(this.req.headers)) {
      if (value !== undefined) {
        result[name] = value
      }
    }

    return result
  }
}

class WebNextRequest extends BaseNextRequest<ReadableStream | null> {
  constructor(public request: Request, config: BaseNextRequestConfig) {
    super(
      request.url,
      request.method.toUpperCase(),
      request.clone().body,
      config
    )
  }

  async parseBody(_limit: string | number): Promise<any> {
    // TODO: implement parseBody for web
    return
  }

  getHeader(name: string): string | undefined {
    return this.request.headers.get(name) ?? undefined
  }

  getAllHeaders(): Record<string, string | string[]> {
    const result: Record<string, string | string[]> = {}

    for (const [name, value] of this.request.headers.entries()) {
      result[name] = value
    }

    return result
  }
}

export abstract class BaseNextResponse<Destination> {
  abstract statusCode: number | undefined
  abstract statusMessage: string | undefined
  abstract get sent(): boolean

  constructor(public destination: Destination) {}

  /**
   * Sets a value for the header overwriting existing values
   */
  abstract setHeader(name: string, value: string): this

  /**
   * Appends value for the given header name
   */
  abstract appendHeader(name: string, value: string): this

  /**
   * Get all vaues for a header as an array or undefined if no value is present
   */
  abstract getHeaderValues(name: string): string[] | undefined

  /**
   * Get vaues for a header concatenated using `,` or undefined if no value is present
   */
  abstract getHeader(name: string): string | undefined

  abstract body(value: string): this

  abstract send(): void

  // Utils implemented using the abstract methods above

  redirect(destination: string, statusCode: number) {
    this.setHeader('Location', destination)
    this.statusCode = statusCode

    if (statusCode === PERMANENT_REDIRECT_STATUS) {
      this.setHeader('Refresh', `0;url=${destination}`)
    }
    return this
  }
}

class NodeNextResponse extends BaseNextResponse<Writable> {
  private textBody: string | undefined = undefined

  constructor(public res: ServerResponse) {
    super(res)
  }

  get sent() {
    return this.res.finished || this.res.headersSent
  }

  get statusCode() {
    return this.res.statusCode
  }

  set statusCode(value: number) {
    this.res.statusCode = value
  }

  get statusMessage() {
    return this.res.statusMessage
  }

  set statusMessage(value: string) {
    this.res.statusMessage = value
  }

  setHeader(name: string, value: string): this {
    this.res.setHeader(name, value)
    return this
  }

  getHeaderValues(name: string): string[] | undefined {
    const values = this.res.getHeader(name)

    if (values === undefined) return undefined

    return (Array.isArray(values) ? values : [values]).map((value) =>
      value.toString()
    )
  }

  getHeader(name: string): string | undefined {
    const values = this.getHeaderValues(name)
    return Array.isArray(values) ? values.join(',') : undefined
  }

  appendHeader(name: string, value: string): this {
    const currentValues = this.getHeaderValues(name) ?? []

    if (!currentValues.includes(value)) {
      this.res.setHeader(name, [...currentValues, value])
    }

    return this
  }

  body(value: string) {
    this.textBody = value
    return this
  }

  send() {
    this.res.end(this.textBody)
  }
}

class WebNextResponse extends BaseNextResponse<WritableStream> {
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

  setHeader(name: string, value: string): this {
    this.headers.set(name, value)
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
