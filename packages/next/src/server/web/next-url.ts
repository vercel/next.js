import type { OutgoingHttpHeaders } from 'http'
import type { DomainLocale, I18NConfig } from '../config-shared'
import type { I18NProvider } from '../lib/i18n-provider'

import { detectDomainLocale } from '../../shared/lib/i18n/detect-domain-locale'
import { formatNextPathnameInfo } from '../../shared/lib/router/utils/format-next-pathname-info'
import { getHostname } from '../../shared/lib/get-hostname'
import { getNextPathnameInfo } from '../../shared/lib/router/utils/get-next-pathname-info'

interface Options {
  base?: string | URL
  headers?: OutgoingHttpHeaders
  forceLocale?: boolean
  nextConfig?: {
    basePath?: string
    i18n?: I18NConfig | null
    trailingSlash?: boolean
  }
  i18nProvider?: I18NProvider
}

const REGEX_LOCALHOST_HOSTNAME =
  /(?!^https?:\/\/)(127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}|\[::1\]|localhost)/

function parseURL(url: string | URL, base?: string | URL) {
  return new URL(
    String(url).replace(REGEX_LOCALHOST_HOSTNAME, 'localhost'),
    base && String(base).replace(REGEX_LOCALHOST_HOSTNAME, 'localhost')
  )
}

const Internal = Symbol('NextURLInternal')

export class NextURL {
  private [Internal]: {
    basePath: string
    buildId?: string
    flightSearchParameters?: Record<string, string>
    defaultLocale?: string
    domainLocale?: DomainLocale
    locale?: string
    options: Options
    trailingSlash?: boolean
    url: URL
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

    this.analyze()
  }

  private analyze() {
    const info = getNextPathnameInfo(this[Internal].url.pathname, {
      nextConfig: this[Internal].options.nextConfig,
      parseData: !process.env.__NEXT_NO_MIDDLEWARE_URL_NORMALIZE,
      i18nProvider: this[Internal].options.i18nProvider,
    })

    const hostname = getHostname(
      this[Internal].url,
      this[Internal].options.headers
    )
    this[Internal].domainLocale = this[Internal].options.i18nProvider
      ? this[Internal].options.i18nProvider.detectDomainLocale(hostname)
      : detectDomainLocale(
          this[Internal].options.nextConfig?.i18n?.domains,
          hostname
        )

    const defaultLocale =
      this[Internal].domainLocale?.defaultLocale ||
      this[Internal].options.nextConfig?.i18n?.defaultLocale

    this[Internal].url.pathname = info.pathname
    this[Internal].defaultLocale = defaultLocale
    this[Internal].basePath = info.basePath ?? ''
    this[Internal].buildId = info.buildId
    this[Internal].locale = info.locale ?? defaultLocale
    this[Internal].trailingSlash = info.trailingSlash
  }

  private formatPathname() {
    return formatNextPathnameInfo({
      basePath: this[Internal].basePath,
      buildId: this[Internal].buildId,
      defaultLocale: !this[Internal].options.forceLocale
        ? this[Internal].defaultLocale
        : undefined,
      locale: this[Internal].locale,
      pathname: this[Internal].url.pathname,
      trailingSlash: this[Internal].trailingSlash,
    })
  }

  private formatSearch() {
    return this[Internal].url.search
  }

  public get buildId() {
    return this[Internal].buildId
  }

  public set buildId(buildId: string | undefined) {
    this[Internal].buildId = buildId
  }

  public get locale() {
    return this[Internal].locale ?? ''
  }

  public set locale(locale: string) {
    if (
      !this[Internal].locale ||
      !this[Internal].options.nextConfig?.i18n?.locales.includes(locale)
    ) {
      throw new TypeError(
        `The NextURL configuration includes no locale "${locale}"`
      )
    }

    this[Internal].locale = locale
  }

  get defaultLocale() {
    return this[Internal].defaultLocale
  }

  get domainLocale() {
    return this[Internal].domainLocale
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
    const search = this.formatSearch()
    return `${this.protocol}//${this.host}${pathname}${search}${this.hash}`
  }

  set href(url: string) {
    this[Internal].url = parseURL(url)
    this.analyze()
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
