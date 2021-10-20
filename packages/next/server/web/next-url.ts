import type { PathLocale } from '../../shared/lib/i18n/normalize-locale-path'
import type { DomainLocale, I18NConfig } from '../config-shared'
import { getLocaleMetadata } from '../../shared/lib/i18n/get-locale-metadata'
import cookie from 'next/dist/compiled/cookie'

/**
 * TODO
 *
 * - Add comments to the URLNext API.
 * - Move internals to be using symbols for its shape.
 * - Make sure logging does not show any implementation details.
 * - Include in the event payload the nextJS configuration
 */

interface Options {
  basePath?: string
  headers?: { [key: string]: string | string[] | undefined }
  i18n?: I18NConfig | null
  trailingSlash?: boolean
}

export class NextURL extends URL {
  private _basePath: string
  private _locale?: {
    defaultLocale: string
    domain?: DomainLocale
    locale: string
    path: PathLocale
    redirect?: string
    trailingSlash?: boolean
  }
  private _options: Options
  private _url: URL

  constructor(url: string, options: Options = {}) {
    super(formatRelative(url))
    this._options = options
    this._basePath = ''
    this._url = formatRelative(url)
    this.analyzeUrl()
  }

  get absolute() {
    return this._url.hostname !== 'localhost'
  }

  analyzeUrl() {
    const { headers = {}, basePath, i18n } = this._options

    if (basePath && this._url.pathname.startsWith(basePath)) {
      this._url.pathname = this._url.pathname.replace(basePath, '') || '/'
      this._basePath = basePath
    } else {
      this._basePath = ''
    }

    if (i18n) {
      this._locale = getLocaleMetadata({
        cookies: () => {
          const value = headers['cookie']
          return value
            ? cookie.parse(Array.isArray(value) ? value.join(';') : value)
            : {}
        },
        headers: headers,
        nextConfig: {
          basePath: basePath,
          i18n: i18n,
        },
        url: {
          hostname: this._url.hostname || null,
          pathname: this._url.pathname,
        },
      })

      if (this._locale?.path.detectedLocale) {
        this._url.pathname = this._locale.path.pathname
      }
    }
  }

  formatPathname() {
    const { i18n } = this._options
    let pathname = this._url.pathname

    if (this._locale?.locale && i18n?.defaultLocale !== this._locale?.locale) {
      pathname = `/${this._locale?.locale}${pathname}`
    }

    if (this._basePath) {
      pathname = `${this._basePath}${pathname}`
    }

    return pathname
  }

  get locale() {
    if (!this._locale) {
      throw new TypeError(`The URL is not configured with i18n`)
    }

    return this._locale.locale
  }

  set locale(locale: string) {
    if (!this._locale) {
      throw new TypeError(`The URL is not configured with i18n`)
    }

    this._locale.locale = locale
  }

  get defaultLocale() {
    return this._locale?.defaultLocale
  }

  get domainLocale() {
    return this._locale?.domain
  }

  get searchParams() {
    return this._url.searchParams
  }

  get host() {
    return this.absolute ? this._url.host : ''
  }

  set host(value: string) {
    this._url.host = value
  }

  get hostname() {
    return this.absolute ? this._url.hostname : ''
  }

  set hostname(value: string) {
    this._url.hostname = value || 'localhost'
  }

  get port() {
    return this.absolute ? this._url.port : ''
  }

  set port(value: string) {
    this._url.port = value
  }

  get protocol() {
    return this.absolute ? this._url.protocol : ''
  }

  set protocol(value: string) {
    this._url.protocol = value
  }

  get href() {
    const pathname = this.formatPathname()
    return this.absolute
      ? `${this.protocol}//${this.host}${pathname}${this._url.search}`
      : `${pathname}${this._url.search}`
  }

  set href(url: string) {
    this._url = formatRelative(url)
    this.analyzeUrl()
  }

  get origin() {
    return this.absolute ? this._url.origin : ''
  }

  get pathname() {
    return this._url.pathname
  }

  set pathname(value: string) {
    this._url.pathname = value
  }

  get hash() {
    return this._url.hash
  }

  set hash(value: string) {
    this._url.hash = value
  }

  get search() {
    return this._url.search
  }

  set search(value: string) {
    this._url.search = value
  }

  get password() {
    return this._url.password
  }

  set password(value: string) {
    this._url.password = value
  }

  get username() {
    return this._url.username
  }

  set username(value: string) {
    this._url.username = value
  }

  get basePath() {
    return this._basePath
  }

  set basePath(value: string) {
    this._basePath = value.startsWith('/') ? value : `/${value}`
  }

  toString() {
    return this.href
  }

  toJSON() {
    return this.href
  }
}

function formatRelative(url: string) {
  return url.startsWith('/')
    ? new URL(url.replace(/^\/+/, '/'), new URL('https://localhost'))
    : new URL(url)
}
