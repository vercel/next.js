import type { DomainLocale, I18NConfig } from '../config-shared'
import { detectDomainLocale } from '../../shared/lib/i18n/detect-domain-locale'
import { formatNextPathnameInfo } from '../../shared/lib/router/utils/format-next-pathname-info'
import { getHostname } from '../../shared/lib/get-hostname'
import { getNextPathnameInfo } from '../../shared/lib/router/utils/get-next-pathname-info'

interface Options {
  base?: string | URL
  headers?: { [key: string]: string | string[] | undefined }
  forceLocale?: boolean
  nextConfig?: {
    basePath?: string
    i18n?: I18NConfig | null
    trailingSlash?: boolean
  }
}

const FLIGHT_PARAMETERS = [
  '__flight__',
  '__flight_router_state_tree__',
  '__flight_prefetch__',
] as const

const REGEX_LOCALHOST_HOSTNAME =
  /(?!^https?:\/\/)(127(?:\.(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)){3}|::1|localhost)/

function parseURL(url: string | URL, base?: string | URL) {
  return new URL(
    String(url).replace(REGEX_LOCALHOST_HOSTNAME, 'localhost'),
    base && String(base).replace(REGEX_LOCALHOST_HOSTNAME, 'localhost')
  )
}

function parseFlightParameters(
  searchParams: URLSearchParams
): Record<string, string> | undefined {
  let flightSearchParameters: Record<string, string> = {}
  let flightSearchParametersUpdated = false
  for (const name of FLIGHT_PARAMETERS) {
    const value = searchParams.get(name)
    if (value === null) {
      continue
    }

    flightSearchParameters[name] = value
    flightSearchParametersUpdated = true
  }

  if (!flightSearchParametersUpdated) {
    return undefined
  }

  return flightSearchParameters
}

const Internal = Symbol('NextURLInternal')

export class NextURL {
  [Internal]: {
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

    this.analyzeUrl()
  }

  private analyzeUrl() {
    const pathnameInfo = getNextPathnameInfo(this[Internal].url.pathname, {
      nextConfig: this[Internal].options.nextConfig,
      parseData: true,
    })

    this[Internal].domainLocale = detectDomainLocale(
      this[Internal].options.nextConfig?.i18n?.domains,
      getHostname(this[Internal].url, this[Internal].options.headers)
    )

    const defaultLocale =
      this[Internal].domainLocale?.defaultLocale ||
      this[Internal].options.nextConfig?.i18n?.defaultLocale

    this[Internal].url.pathname = pathnameInfo.pathname
    this[Internal].defaultLocale = defaultLocale
    this[Internal].basePath = pathnameInfo.basePath ?? ''
    this[Internal].buildId = pathnameInfo.buildId
    this[Internal].locale = pathnameInfo.locale ?? defaultLocale
    this[Internal].trailingSlash = pathnameInfo.trailingSlash
    this[Internal].flightSearchParameters = parseFlightParameters(
      this[Internal].url.searchParams
    )
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
    const flightSearchParameters = this[Internal].flightSearchParameters
    // If no flight parameters are set, return the search string as is.
    // This is a fast path to ensure URLSearchParams only has to be recreated on Flight requests.
    if (!flightSearchParameters) {
      return this[Internal].url.search
    }

    // Create separate URLSearchParams to ensure the original search string is not modified.
    const searchParams = new URLSearchParams(this[Internal].url.searchParams)
    // If any exist this loop is always limited to the amount of FLIGHT_PARAMETERS.
    for (const name in flightSearchParameters) {
      searchParams.set(name, flightSearchParameters[name])
    }

    const params = searchParams.toString()
    return params === '' ? '' : `?${params}`
  }

  public get buildId() {
    return this[Internal].buildId
  }

  public set buildId(buildId: string | undefined) {
    this[Internal].buildId = buildId
  }

  public get flightSearchParameters() {
    return this[Internal].flightSearchParameters
  }

  public set flightSearchParameters(
    flightSearchParams: Record<string, string> | undefined
  ) {
    if (flightSearchParams) {
      for (const name of FLIGHT_PARAMETERS) {
        // Ensure only the provided values are set
        if (flightSearchParams[name]) {
          this[Internal].url.searchParams.set(name, flightSearchParams[name])
        } else {
          // Delete the ones that are not provided as flightData should be overridden.
          this[Internal].url.searchParams.delete(name)
        }
      }
    } else {
      for (const name of FLIGHT_PARAMETERS) {
        this[Internal].url.searchParams.delete(name)
      }
    }

    this[Internal].flightSearchParameters = flightSearchParams
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
    return `${this.protocol}//${this.host}${pathname}${search}`
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
