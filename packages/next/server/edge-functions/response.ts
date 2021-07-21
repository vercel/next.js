import { appendSearch, byteLength, encode } from './utils'
import { formatPathname, formatUrl } from './utils'
import cookie, { CookieSerializeOptions } from 'next/dist/compiled/cookie'
import type { HeadersEvent } from './types'
import type { ParsedNextUrl } from '../../shared/lib/router/utils/parse-next-url'

export class EdgeResponse {
  private _body?: null | string | ReadableStream
  private _cookieParser: () => { [key: string]: string }
  private _input = new TransformStream()
  private _method: string
  private _onHeadersSent: (event: HeadersEvent, res: EdgeResponse) => void
  private _output = new TransformStream()
  private _reader?: ReadableStreamDefaultReader
  private _streaming = false
  private _url: ParsedNextUrl
  private _writer?: WritableStreamDefaultWriter

  public finished = false
  public headers
  public headersSent = false
  public location?: string
  public rewriteLocation?: string
  public statusCode = 200

  constructor(options: {
    headers?: Headers
    method: string
    onHeadersSent(event: HeadersEvent, res: EdgeResponse): void
    url: ParsedNextUrl
  }) {
    this._method = options.method
    this._onHeadersSent = options.onHeadersSent
    this._url = options.url
    this.headers = options.headers || new Headers()

    this._cookieParser = () => {
      const value = this.headers.get('cookie')
      return value ? cookie.parse(value) : {}
    }

    this.reader
      .read()
      .then(async (result) => {
        this._streaming = true

        if (!this.headersSent) {
          this.writeHead(this.statusCode)
        }

        if (!result.done && result.value) {
          await this.writer.write(result.value)
          while (true) {
            let { value, done } = await this.reader.read()
            if (done) break
            await this.writer.write(value)
          }
        }

        this.writer.close()
      })
      .catch(console.error)
  }

  private get reader() {
    if (!this._reader) {
      this._reader = this._input.readable.getReader()
    }

    return this._reader
  }

  private get writer() {
    if (!this._writer) {
      this._writer = this._output.writable.getWriter()
      this._streaming = true
      if (!this.headersSent) {
        this.writeHead(this.statusCode)
      }
    }

    return this._writer
  }

  private _formatUrl(url: string | ParsedNextUrl) {
    if (typeof url === 'string') {
      return formatPathname(url, {
        basePath: this._url.basePath,
        defaultLocale: this._url.locale?.defaultLocale,
        locale: this._url.locale?.locale,
      })
    }

    if (
      this._url.protocol === url.protocol &&
      this._url.hostname === url.hostname &&
      this._url.port === url.port
    ) {
      return formatUrl({
        ...url,
        protocol: null,
        hostname: null,
        port: null,
        search: appendSearch(url.search, url.query),
        pathname: formatPathname(url.pathname, {
          basePath: url.basePath,
          defaultLocale: url.locale?.defaultLocale,
          locale: url.locale?.locale,
        }),
      })
    }

    return formatUrl({
      ...url,
      search: appendSearch(url.search, url.query),
      pathname: formatPathname(url.pathname, {
        basePath: url.basePath,
        defaultLocale: url.locale?.defaultLocale,
        locale: url.locale?.locale,
      }),
    })
  }

  private _sendHeaders(event: HeadersEvent) {
    if (this.headersSent) {
      throw new Error(`Headers were already sent`)
    }

    this.headersSent = true
    this._onHeadersSent(event, this)
  }

  public get body() {
    return this._body
  }

  public get cookies() {
    return this._cookieParser()
  }

  public get writable() {
    return this._input.writable
  }

  public get readable() {
    return this._output.readable
  }

  public status(statusCode: number) {
    this.statusCode = statusCode
    return this
  }

  public setHeader(name: string, value: string | string[]) {
    if (Array.isArray(value)) {
      value.forEach((item) => this.headers.append(name, item))
    } else {
      this.headers.set(name, value)
    }
  }

  public write(chunk: any) {
    if (!this.finished) {
      this.writer.write(typeof chunk === 'string' ? encode(chunk) : chunk)
    } else {
      throw new Error('The socket is already closed')
    }
  }

  public setHeaders(headers?: Record<string, string>) {
    if (this.headersSent) {
      throw new Error('Headers were sent')
    }
    for (let head in headers) {
      this.headers.set(head, headers[head])
    }

    return this
  }

  public writeHead(code: number, headers?: Record<string, string>) {
    this.statusCode = code
    this.setHeaders(headers)
    this._streaming = true
    this._sendHeaders('streaming')
  }

  public cookie(
    name: string,
    value: { [key: string]: any } | string,
    opts: CookieSerializeOptions = {}
  ) {
    const val =
      typeof value === 'object' ? 'j:' + JSON.stringify(value) : String(value)

    if (opts.maxAge) {
      opts.expires = new Date(Date.now() + opts.maxAge)
      opts.maxAge /= 1000
    }

    if (opts.path == null) {
      opts.path = '/'
    }

    this.headers.append('Set-Cookie', cookie.serialize(name, String(val), opts))
    return this
  }

  public clearCookie(name: string, opts: CookieSerializeOptions = {}) {
    return this.cookie(name, '', { expires: new Date(1), path: '/', ...opts })
  }

  public json(obj: { [key: string]: any }): void {
    const body = JSON.stringify(obj)
    if (!this.headers.get('content-type')) {
      this.headers.set('content-type', 'application/json')
    }

    this.send(body)
  }

  public send(
    data:
      | string
      | number
      | boolean
      | ReadableStream<Uint8Array>
      | { [key: string]: any }
      | null = '',
    headers?: Record<string, string>
  ): void {
    if (this.finished) {
      throw new Error('Response has been already been sent')
    }
    this.setHeaders(headers)

    if (data instanceof ReadableStream) {
      this._body = data
      return this.end()
    } else if (typeof data === 'object' && data !== null) {
      return this.json(data)
    }

    const cHeaders: Record<string, string> = {}
    const len = cHeaders['content-length'] || this.headers.get('content-length')
    let type = cHeaders['content-type'] || this.headers.get('content-type')

    this._body = data === null ? '' : String(data)
    cHeaders['content-length'] = len || String(byteLength(this._body))
    cHeaders['content-type'] = type || 'text/plain'

    if (
      this.statusCode === 204 ||
      this.statusCode === 205 ||
      this.statusCode === 304
    ) {
      this.headers.delete('content-length')
      this.headers.delete('content-type')
      delete cHeaders['content-length']
      delete cHeaders['content-type']
      this._body = null
    } else if (this._method === 'HEAD') {
      this._body = null
    }

    this.end()
  }

  public redirect(url: string | ParsedNextUrl): void
  public redirect(status: number, url: string | ParsedNextUrl): void
  public redirect(
    statusOrUrl: string | number | ParsedNextUrl,
    url?: string | ParsedNextUrl
  ) {
    let status: number
    let address: string

    if (typeof url === 'undefined') {
      if (typeof statusOrUrl === 'number') {
        throw new TypeError(`Expected as string as redirect URL`)
      }

      status = 302
      address = this._formatUrl(statusOrUrl)
    } else {
      if (typeof statusOrUrl !== 'number') {
        throw new TypeError(`Expected as number as redirect status`)
      }

      status = statusOrUrl
      address = this._formatUrl(url)
    }

    this.status(status)
    this.location = this._formatUrl(
      address === 'back' ? this.headers.get('Referrer') || '/' : address
    )
    this.end()
  }

  public rewrite(url: string | ParsedNextUrl) {
    this.rewriteLocation = this._formatUrl(url)
    this.end()
  }

  public end(data: string | null = null) {
    if (!this.finished) {
      if (this._streaming) {
        if (typeof data === 'string') {
          this.write(data)
        }

        this.writer.close()
      } else {
        if (typeof data === 'string') {
          return this.send(data)
        }
      }

      this.finished = true
      if (!this.headersSent) {
        if (this._streaming) {
          this._sendHeaders('streaming')
        } else {
          this._sendHeaders('data')
        }
      }
    }
  }
}
