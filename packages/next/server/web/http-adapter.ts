import type { IncomingHttpHeaders } from 'http'

import { NextRequest } from './spec-extension/request'
import { toNodeHeaders } from './utils'

export class WebIncomingMessage {
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

export class WebServerResponse {
  private headers: { [name: string]: number | string | string[] } = {}

  statusCode: number = 200

  // FIXME: The internal states should support correctly throwing errors when
  // using improperly. And in the future it should be able to be translated to
  // the Node HTTP OutgoingMessage.
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
