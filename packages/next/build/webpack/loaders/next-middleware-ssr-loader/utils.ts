import type { IncomingHttpHeaders } from 'http'

import { NextRequest } from '../../../../server/web/spec-extension/request'
import { toNodeHeaders } from '../../../../server/web/utils'

export class WebRequestBasedIncomingMessage {
  url: string
  headers: IncomingHttpHeaders
  cookies: { [key: string]: string }
  method?: string

  constructor(req: NextRequest) {
    this.url = req.url
    this.headers = toNodeHeaders(req.headers)
    this.cookies = req.cookies
    this.method = req.method
  }
}

export class WebResponseBasedServerResponse {
  private headers: { [name: string]: number | string | string[] } = {}

  statusCode: number = 200

  // FIXME
  finished: boolean = false
  headersSent: boolean = false
  body: [] = []

  setHeader(name: string, value: number | string | string[]) {
    this.headers[name] = value
  }
  getHeader(name: string): number | string | string[] | undefined {
    return this.headers[name]
  }
  getHeaders() {
    return this.headers
  }
  getHeaderNames() {
    return Object.keys(this.headers)
  }
  hasHeader(name: string) {
    return this.headers.hasOwnProperty(name)
  }
  removeHeader(name: string) {
    delete this.headers[name]
  }

  // Leave the implementation empty here because they're not currently used.
  // The underlying stream is abstracted out with `RenderResult`.
  cork() {}
  uncork() {}
  on(_name: string, _callback: () => void) {}
  removeListener(_name: string, _callback: () => void) {}
  write(_chunk?: string) {}
  end(_chunk?: string) {}
}
