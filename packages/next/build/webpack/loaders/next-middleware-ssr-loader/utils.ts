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
