import type { RequestData } from './types'
import type { ParsedNextUrl } from '../../shared/lib/router/utils/parse-next-url'
import type { IResult as UAResult } from 'next/dist/compiled/ua-parser-js'
import cookie from 'next/dist/compiled/cookie'
import parseUA from 'next/dist/compiled/ua-parser-js'
import isBot from 'next/dist/compiled/isbot'

interface UserAgent extends UAResult {
  isBot: boolean
}
export class EdgeRequest {
  private _cookieParser: () => { [key: string]: string }
  private _parsedUA?: UserAgent | null
  public geo: NonNullable<RequestData['geo']>
  public headers: Headers
  public ip?: string
  public method?: string
  public url?: ParsedNextUrl

  constructor(req: RequestData) {
    this.geo = req.geo || {}
    this.headers = req.headers
    this.ip = req.ip || '127.0.0.1'
    this.method = req.method
    this.url = req.url

    this._cookieParser = () => {
      const value = this.headers.get('cookie')
      return value ? cookie.parse(value) : {}
    }
  }

  public get cookies() {
    return this._cookieParser()
  }

  public get ua() {
    if (typeof this._parsedUA !== 'undefined') {
      return this._parsedUA || undefined
    }

    const uaString = this.headers.get('user-agent')
    if (!uaString) {
      this._parsedUA = null
      return this._parsedUA || undefined
    }

    this._parsedUA = {
      ...parseUA(uaString),
      isBot: isBot(uaString),
    }

    return this._parsedUA
  }
}
