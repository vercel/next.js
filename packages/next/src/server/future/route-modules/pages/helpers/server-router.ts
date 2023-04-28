import type { ParsedUrlQuery } from 'querystring'
import type { NextRouter } from '../../../../../shared/lib/router/router'
import type { DomainLocale } from '../../../../config-shared'

import { NoRouterError } from './errors'

interface ServerRouterOptions {
  readonly pathname: string
  readonly query: ParsedUrlQuery
  readonly asPath: string
  readonly basePath: string
  readonly isFallback: boolean
  readonly locale: string | undefined
  readonly isReady: boolean
  readonly locales: string[] | undefined
  readonly defaultLocale: string | undefined
  readonly domainLocales: DomainLocale[] | undefined
  readonly isPreview: boolean
  readonly isLocaleDomain: boolean
}

export class ServerRouter implements NextRouter {
  public readonly route: string
  public readonly pathname: string
  public readonly query: ParsedUrlQuery
  public readonly asPath: string
  public readonly basePath: string
  public readonly isFallback: boolean
  public readonly locale: string | undefined
  public readonly isReady: boolean
  public readonly locales: string[] | undefined
  public readonly defaultLocale: string | undefined
  public readonly domainLocales: DomainLocale[] | undefined
  public readonly isPreview: boolean
  public readonly isLocaleDomain: boolean

  public constructor({
    pathname,
    query,
    asPath,
    isFallback,
    basePath,
    locale,
    locales,
    defaultLocale,
    isReady,
    domainLocales,
    isPreview,
    isLocaleDomain,
  }: ServerRouterOptions) {
    this.route = pathname.replace(/\/$/, '') || '/'
    this.pathname = pathname
    this.query = query
    this.asPath = asPath
    this.isFallback = isFallback
    this.basePath = basePath
    this.locale = locale
    this.locales = locales
    this.defaultLocale = defaultLocale
    this.isReady = isReady
    this.domainLocales = domainLocales
    this.isPreview = isPreview
    this.isLocaleDomain = isLocaleDomain
  }

  public get events(): never {
    throw new NoRouterError()
  }

  public push(): never {
    throw new NoRouterError()
  }

  public replace(): never {
    throw new NoRouterError()
  }

  public reload(): never {
    throw new NoRouterError()
  }

  public back(): never {
    throw new NoRouterError()
  }

  public forward(): never {
    throw new NoRouterError()
  }

  public prefetch(): never {
    throw new NoRouterError()
  }

  public beforePopState(): never {
    throw new NoRouterError()
  }
}
