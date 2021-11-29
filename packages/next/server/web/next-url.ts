import type { PathLocale } from '../../shared/lib/i18n/normalize-locale-path'
import type { DomainLocale, I18NConfig } from '../config-shared'
import { getLocaleMetadata } from '../../shared/lib/i18n/get-locale-metadata'
import { replaceBasePath } from '../router'
import cookie from 'next/dist/compiled/cookie'

interface Options {
  base?: string | URL
  basePath?: string
  headers?: { [key: string]: string | string[] | undefined }
  i18n?: I18NConfig | null
  trailingSlash?: boolean
}

export class NextURL extends URL {
  #url: URL
  #options: Options
  #basePath: string
  #locale?: {
    defaultLocale: string
    domain?: DomainLocale
    locale: string
    path: PathLocale
    redirect?: string
    trailingSlash?: boolean
  }

  constructor(input: string | URL, base?: string | URL, opts?: Options)
  constructor(input: string | URL, opts?: Options)
  constructor(
    input: string | URL,
    baseOrOpts?: string | URL | Options,
    opts?: Options
  ) {
    super('http://127.0.0.1') // This works as a placeholder

    let base: undefined | string | URL
    let options: Options

    if (baseOrOpts instanceof URL || typeof baseOrOpts === 'string') {
      base = baseOrOpts
      options = opts || {}
    } else {
      options = opts || baseOrOpts || {}
    }

    this.#url = parseURL(input, base ?? options.base)
    this.#options = options
    this.#basePath = ''
    this.#analyzeUrl()
  }

  #analyzeUrl() {
    const { headers = {}, basePath, i18n } = this.#options

    if (basePath && this.#url.pathname.startsWith(basePath)) {
      this.#url.pathname = replaceBasePath(this.#url.pathname, basePath)
      this.#basePath = basePath
    } else {
      this.#basePath = ''
    }

    if (i18n) {
      this.#locale = getLocaleMetadata({
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
          hostname: this.#url.hostname || null,
          pathname: this.#url.pathname,
        },
      })

      if (this.#locale?.path.detectedLocale) {
        this.#url.pathname = this.#locale.path.pathname
      }
    }
  }

  #formatPathname() {
    const { i18n } = this.#options
    let pathname = this.#url.pathname

    if (this.#locale?.locale && i18n?.defaultLocale !== this.#locale?.locale) {
      pathname = `/${this.#locale?.locale}${pathname}`
    }

    if (this.#basePath) {
      pathname = `${this.#basePath}${pathname}`
    }

    return pathname
  }

  get locale() {
    return this.#locale?.locale ?? ''
  }

  set locale(locale: string) {
    if (!this.#locale || !this.#options.i18n?.locales.includes(locale)) {
      throw new TypeError(
        `The NextURL configuration includes no locale "${locale}"`
      )
    }

    this.#locale.locale = locale
  }

  get defaultLocale() {
    return this.#locale?.defaultLocale
  }

  get domainLocale() {
    return this.#locale?.domain
  }

  get searchParams() {
    return this.#url.searchParams
  }

  get host() {
    return this.#url.host
  }

  set host(value: string) {
    this.#url.host = value
  }

  get hostname() {
    return this.#url.hostname
  }

  set hostname(value: string) {
    this.#url.hostname = value
  }

  get port() {
    return this.#url.port
  }

  set port(value: string) {
    this.#url.port = value
  }

  get protocol() {
    return this.#url.protocol
  }

  set protocol(value: string) {
    this.#url.protocol = value
  }

  get href() {
    const pathname = this.#formatPathname()
    return `${this.protocol}//${this.host}${pathname}${this.#url.search}`
  }

  set href(url: string) {
    this.#url = parseURL(url)
    this.#analyzeUrl()
  }

  get origin() {
    return this.#url.origin
  }

  get pathname() {
    return this.#url.pathname
  }

  set pathname(value: string) {
    this.#url.pathname = value
  }

  get hash() {
    return this.#url.hash
  }

  set hash(value: string) {
    this.#url.hash = value
  }

  get search() {
    return this.#url.search
  }

  set search(value: string) {
    this.#url.search = value
  }

  get password() {
    return this.#url.password
  }

  set password(value: string) {
    this.#url.password = value
  }

  get username() {
    return this.#url.username
  }

  set username(value: string) {
    this.#url.username = value
  }

  get basePath() {
    return this.#basePath
  }

  set basePath(value: string) {
    this.#basePath = value.startsWith('/') ? value : `/${value}`
  }

  toString() {
    return this.href
  }

  toJSON() {
    return this.href
  }
}

const REGEX_LOCALHOST_HOSTNAME =
  /(?!^https?:\/\/)(127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}|::1|localhost)/

function parseURL(url: string | URL, base?: string | URL) {
  return new URL(
    String(url).replace(REGEX_LOCALHOST_HOSTNAME, 'localhost'),
    base && String(base).replace(REGEX_LOCALHOST_HOSTNAME, 'localhost')
  )
}
