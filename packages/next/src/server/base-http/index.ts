import type { IncomingHttpHeaders, OutgoingHttpHeaders } from 'http'
import type { I18NConfig } from '../config-shared'

import { RedirectStatusCode } from '../../client/components/redirect-status-code'
import type { NextApiRequestCookies } from '../api-utils'
import { getCookieParser } from '../api-utils/get-cookie-parser'

export interface BaseNextRequestConfig {
  basePath: string | undefined
  i18n?: I18NConfig
  trailingSlash?: boolean | undefined
}

export type FetchMetrics = Array<{
  url: string
  idx: number
  end: number
  start: number
  method: string
  status: number
  cacheReason: string
  cacheStatus: 'hit' | 'miss' | 'skip'
}>

export abstract class BaseNextRequest<Body = any> {
  protected _cookies: NextApiRequestCookies | undefined
  public abstract headers: IncomingHttpHeaders

  constructor(public method: string, public url: string, public body: Body) {}

  // Utils implemented using the abstract methods above

  public get cookies() {
    if (this._cookies) return this._cookies
    return (this._cookies = getCookieParser(this.headers)())
  }
}

export abstract class BaseNextResponse<Destination = any> {
  abstract statusCode: number | undefined
  abstract statusMessage: string | undefined
  abstract get sent(): boolean

  constructor(public destination: Destination) {}

  /**
   * Sets a value for the header overwriting existing values
   */
  abstract setHeader(name: string, value: string | string[]): this

  /**
   * Removes a header
   */
  abstract removeHeader(name: string): this

  /**
   * Appends value for the given header name
   */
  abstract appendHeader(name: string, value: string): this

  /**
   * Get all vaues for a header as an array or undefined if no value is present
   */
  abstract getHeaderValues(name: string): string[] | undefined

  abstract hasHeader(name: string): boolean

  /**
   * Get vaues for a header concatenated using `,` or undefined if no value is present
   */
  abstract getHeader(name: string): string | undefined

  abstract getHeaders(): OutgoingHttpHeaders

  abstract body(value: string): this

  abstract send(): void

  // Utils implemented using the abstract methods above

  redirect(destination: string, statusCode: number) {
    this.setHeader('Location', destination)
    this.statusCode = statusCode

    // Since IE11 doesn't support the 308 header add backwards
    // compatibility using refresh header
    if (statusCode === RedirectStatusCode.PermanentRedirect) {
      this.setHeader('Refresh', `0;url=${destination}`)
    }
    return this
  }
}
