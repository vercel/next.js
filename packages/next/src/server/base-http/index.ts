import type { IncomingHttpHeaders } from 'http'
import type { I18NConfig } from '../config-shared'

import { PERMANENT_REDIRECT_STATUS } from '../../shared/lib/constants'
import { getCookieParser, NextApiRequestCookies } from '../api-utils'

export interface BaseNextRequestConfig {
  basePath: string | undefined
  i18n?: I18NConfig
  trailingSlash?: boolean | undefined
}

export abstract class BaseNextRequest<Body = any> {
  protected _cookies: NextApiRequestCookies | undefined
  public abstract headers: IncomingHttpHeaders

  constructor(public method: string, public url: string, public body: Body) {}

  abstract parseBody(limit: string | number): Promise<any>

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

  abstract body(value: string): this

  abstract send(): void

  // Utils implemented using the abstract methods above

  redirect(destination: string, statusCode: number) {
    this.setHeader('Location', destination)
    this.statusCode = statusCode

    // Since IE11 doesn't support the 308 header add backwards
    // compatibility using refresh header
    if (statusCode === PERMANENT_REDIRECT_STATUS) {
      this.setHeader('Refresh', `0;url=${destination}`)
    }
    return this
  }
}
