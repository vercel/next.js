import type { PathLocale } from '../../shared/lib/i18n/normalize-locale-path'
import type { DomainLocale, I18NConfig } from '../config-shared'
import { getLocaleMetadata } from '../../shared/lib/i18n/get-locale-metadata'
import cookie from 'next/dist/compiled/cookie'
import { replaceBasePath } from '../router-utils'

interface Options {
  base?: string | URL
  basePath?: string
  headers?: { [key: string]: string | string[] | undefined }
  i18n?: I18NConfig | null
  trailingSlash?: boolean
}

const Internal = Symbol('NextURLInternal')

export class NextURL {
  [Internal]: {
    url: URL
    options: Options
    basePath: string
    locale?: {
      defaultLocale: string
      domain?: DomainLocale
      locale: string
      path: PathLocale
      redirect?: string
      trailingSlash?: boolean
    }
  }

  constructor(input: string | URL, base?: string | URL, opts?: Options)
  constructor(input: string | URL, opts?: Options)
  constructor(
    input: string | URL,
    baseOrOpts?: string | URL | Options,
    opts?: Options
  ) {
    let base: undefined | string | URL
    let options: Options

    if (
      (typeof baseOrOpts === 'object' && 'pathname' in baseOrOpts) ||
      typeof baseOrOpts === 'string'
    ) {
      base = baseOrOpts
      options = opts || {}
    } else {
      options = opts || baseOrOpts || {}
    }

    this[Internal] = {
      url: parseURL(input, base ?? options.base),
      options: options,
      basePath: '',
    }

    this.analyzeUrl()
  }

  private analyzeUrl() {
    const { headers = {}, basePath, i18n } = this[Internal].options

    if (basePath && this[Internal].url.pathname.startsWith(basePath)) {
      this[Internal].url.pathname = replaceBasePath(
        this[Internal].url.pathname,
        basePath
      )
      this[Internal].basePath = basePath
    } else {
      this[Internal].basePath = ''
    }

    if (i18n) {
      this[Internal].locale = getLocaleMetadata({
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
          hostname: this[Internal].url.hostname || null,
          pathname: this[Internal].url.pathname,
        },
      })

      if (this[Internal].locale?.path.detectedLocale) {
        this[Internal].url.pathname = this[Internal].locale!.path.pathname
      }
    }
  }

  private formatPathname() {
    const { i18n } = this[Internal].options
    let pathname = this[Internal].url.pathname

    if (
      this[Internal].locale?.locale &&
      i18n?.defaultLocale !== this[Internal].locale?.locale &&
      !this.hasPathPrefix('/api')
    ) {
      pathname = `/${this[Internal].locale?.locale}${pathname}`
    }

    if (this[Internal].basePath) {
      pathname = `${this[Internal].basePath}${pathname}`
    }

    return pathname
  }

  private hasPathPrefix(prefix: string) {
    const pathname = this[Internal].url.pathname
    return pathname === prefix || pathname.startsWith(prefix + '/')
  }

  public get locale() {
    return this[Internal].locale?.locale ?? ''
  }

  public set locale(locale: string) {
    if (
      !this[Internal].locale ||
      !this[Internal].options.i18n?.locales.includes(locale)
    ) {
      throw new TypeError(
        `The NextURL configuration includes no locale "${locale}"`
      )
    }

    this[Internal].locale!.locale = locale
  }

  get defaultLocale() {
    return this[Internal].locale?.defaultLocale
  }

  get domainLocale() {
    return this[Internal].locale?.domain
  }

  get searchParams() {
    return this[Internal].url.searchParams
  }

  get host() {
    return this[Internal].url.host
  }

  set host(value: string) {
    this[Internal].url.host = value
  }

  get hostname() {
    return this[Internal].url.hostname
  }

  set hostname(value: string) {
    this[Internal].url.hostname = value
  }

  get port() {
    return this[Internal].url.port
  }

  set port(value: string) {
    this[Internal].url.port = value
  }

  get protocol() {
    return this[Internal].url.protocol
  }

  set protocol(value: string) {
    this[Internal].url.protocol = value
  }

  get href() {
    const pathname = this.formatPathname()
    return `${this.protocol}//${this.host}${pathname}${this[Internal].url.search}`
  }

  set href(url: string) {
    this[Internal].url = parseURL(url)
    this.analyzeUrl()
  }

  get origin() {
    return this[Internal].url.origin
  }

  get pathname() {
    return this[Internal].url.pathname
  }

  set pathname(value: string) {
    this[Internal].url.pathname = value
  }

  get hash() {
    return this[Internal].url.hash
  }

  set hash(value: string) {
    this[Internal].url.hash = value
  }

  get search() {
    return this[Internal].url.search
  }

  set search(value: string) {
    this[Internal].url.search = value
  }

  get password() {
    return this[Internal].url.password
  }

  set password(value: string) {
    this[Internal].url.password = value
  }

  get username() {
    return this[Internal].url.username
  }

  set username(value: string) {
    this[Internal].url.username = value
  }

  get basePath() {
    return this[Internal].basePath
  }

  set basePath(value: string) {
    this[Internal].basePath = value.startsWith('/') ? value : `/${value}`
  }

  toString() {
    return this.href
  }

  toJSON() {
    return this.href
  }

  [Symbol.for('edge-runtime.inspect.custom')]() {
    return {
      href: this.href,
      origin: this.origin,
      protocol: this.protocol,
      username: this.username,
      password: this.password,
      host: this.host,
      hostname: this.hostname,
      port: this.port,
      pathname: this.pathname,
      search: this.search,
      searchParams: this.searchParams,
      hash: this.hash,
    }
  }

  clone() {
    return new NextURL(String(this), this[Internal].options)
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
