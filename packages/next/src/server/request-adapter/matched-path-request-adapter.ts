import type { ParsedUrlQuery } from 'querystring'
import type { BaseNextRequest } from '../base-http'
import type {
  NextEnabledDirectories,
  NormalizedRouteManifest,
} from '../base-server'
import type {
  I18NProvider,
  LocaleAnalysisResult,
} from '../future/helpers/i18n-provider'
import type { RouteMatcherManager } from '../future/route-matcher-managers/route-matcher-manager'
import type { NextConfigComplete } from '../config-shared'

import { ActionPathnameNormalizer } from '../future/normalizers/request/action'
import { NextDataPathnameNormalizer } from '../future/normalizers/request/next-data'
import { PostponedPathnameNormalizer } from '../future/normalizers/request/postponed'
import { PrefetchRSCPathnameNormalizer } from '../future/normalizers/request/prefetch-rsc'
import { RSCPathnameNormalizer } from '../future/normalizers/request/rsc'
import { I18nPathnameNormalizer } from '../future/normalizers/request/i18n'
import { denormalizePagePath } from '../../shared/lib/page-path/denormalize-page-path'
import { isDynamicRoute } from '../../shared/lib/router/utils'
import { addRequestMeta, type NextUrlWithParsedQuery } from '../request-meta'
import { getUtils } from '../server-utils'
import { normalizeNextQueryParam } from '../web/utils'
import { getHostname } from '../../shared/lib/get-hostname'
import { parseUrl } from '../../shared/lib/router/utils/parse-url'
import { stripFlightHeaders } from '../app-render/strip-flight-headers'
import { formatUrl } from '../../shared/lib/router/utils/format-url'
import {
  RSC_HEADER,
  NEXT_ROUTER_PREFETCH_HEADER,
} from '../../client/components/app-router-headers'
import { checkIsAppPPREnabled } from '../lib/experimental/ppr'
import { BasePathPathnameNormalizer } from '../future/normalizers/request/base-path'
import { format } from 'url'
import { BaseRequestAdapter } from './base-request-adapter'

export class MatchedPathRequestAdapter<
  ServerRequest extends BaseNextRequest,
> extends BaseRequestAdapter<ServerRequest> {
  protected readonly normalizers: {
    readonly basePath: BasePathPathnameNormalizer | undefined
    readonly action: ActionPathnameNormalizer | undefined
    readonly postponed: PostponedPathnameNormalizer | undefined
    readonly rsc: RSCPathnameNormalizer | undefined
    readonly prefetchRSC: PrefetchRSCPathnameNormalizer | undefined
    readonly data: NextDataPathnameNormalizer | undefined
    readonly i18n: I18nPathnameNormalizer | undefined
  }

  constructor(
    private readonly buildID: string,
    enabledDirectories: NextEnabledDirectories,
    i18nProvider: I18NProvider | undefined,
    private readonly matchers: RouteMatcherManager,
    nextConfig: NextConfigComplete,
    private readonly getRoutesManifest: () =>
      | NormalizedRouteManifest
      | undefined
  ) {
    super(enabledDirectories, i18nProvider, nextConfig)

    const isAppPPREnabled = checkIsAppPPREnabled(
      this.nextConfig.experimental.ppr
    )

    this.normalizers = {
      basePath: this.nextConfig.basePath
        ? new BasePathPathnameNormalizer(this.nextConfig.basePath)
        : undefined,
      postponed:
        this.enabledDirectories.app && isAppPPREnabled
          ? new PostponedPathnameNormalizer()
          : undefined,
      prefetchRSC:
        this.enabledDirectories.app && isAppPPREnabled
          ? new PrefetchRSCPathnameNormalizer()
          : undefined,
      action: enabledDirectories.app
        ? new ActionPathnameNormalizer()
        : undefined,
      rsc: enabledDirectories.app ? new RSCPathnameNormalizer() : undefined,
      data: enabledDirectories.pages
        ? new NextDataPathnameNormalizer(this.buildID)
        : undefined,
      i18n: i18nProvider ? new I18nPathnameNormalizer(i18nProvider) : undefined,
    }
  }

  protected adaptRSCRequestMetadata(
    req: ServerRequest,
    parsedURL: NextUrlWithParsedQuery
  ): void {
    if (!parsedURL.pathname) {
      throw new Error('Invariant: pathname must be set')
    }

    if (this.normalizers.prefetchRSC?.match(parsedURL.pathname)) {
      parsedURL.pathname = this.normalizers.prefetchRSC.normalize(
        parsedURL.pathname,
        true
      )

      // Mark the request as a router prefetch request.
      req.headers[RSC_HEADER.toLowerCase()] = '1'
      req.headers[NEXT_ROUTER_PREFETCH_HEADER.toLowerCase()] = '1'
      addRequestMeta(req, 'isRSCRequest', true)
      addRequestMeta(req, 'isPrefetchRSCRequest', true)
    } else if (this.normalizers.rsc?.match(parsedURL.pathname)) {
      parsedURL.pathname = this.normalizers.rsc.normalize(
        parsedURL.pathname,
        true
      )

      // Mark the request as a RSC request.
      req.headers[RSC_HEADER.toLowerCase()] = '1'
      delete req.headers[NEXT_ROUTER_PREFETCH_HEADER.toLowerCase()]
      addRequestMeta(req, 'isRSCRequest', true)
    } else if (req.headers['x-now-route-matches']) {
      // We didn't match any route based matchers above, but we're in minimal
      // mode, so we should remove any headers from the request that are related
      // to flight data.
      stripFlightHeaders(req.headers)

      return
    } else {
      return super.adaptRSCRequestMetadata(req, parsedURL)
    }

    const parsed = parseUrl(req.url)
    parsed.pathname = parsedURL.pathname
    req.url = formatUrl(parsed)
  }

  public async adapt(
    req: ServerRequest,
    parsedURL: NextUrlWithParsedQuery
  ): Promise<void> {
    if (
      !req.headers['x-matched-path'] ||
      typeof req.headers['x-matched-path'] !== 'string'
    ) {
      // 'x-matched-path' is not present, let's fallback to the base adapter.
      return this.adaptRequest(req, parsedURL)
    }

    if (!parsedURL.pathname) {
      throw new Error('Invariant: pathname must be set')
    }

    const originalPathname = parsedURL.pathname
    this.adaptRSCRequestMetadata(req, parsedURL)

    const url = parseUrl(req.url.replace(/^\/+/, '/'))

    // If the pathname was updated, we should update the req.url to reflect it.
    const originalURLPathname = url.pathname
    if (originalPathname !== parsedURL.pathname) {
      url.pathname = parsedURL.pathname
    }

    if (this.normalizers.basePath) {
      const pathname = this.normalizers.basePath.normalize(url.pathname)
      if (pathname !== url.pathname) {
        url.pathname = pathname
      }
    }

    // If the pathname was updated, we should update the req.url to reflect it.
    if (originalURLPathname !== url.pathname) {
      req.url = format(url)
    }

    let pathnameInfo: LocaleAnalysisResult | undefined
    if (this.i18nProvider) {
      pathnameInfo = this.i18nProvider.analyze(url.pathname)
      url.pathname = pathnameInfo.pathname
    }

    if (this.enabledDirectories.app) {
      // ensure /index path is normalized for prerender
      // in minimal mode
      if (req.url.match(/^\/index($|\?)/)) {
        req.url = req.url.replace(/^\/index/, '/')
      }
      parsedURL.pathname =
        parsedURL.pathname === '/index' ? '/' : parsedURL.pathname
    }

    // x-matched-path is the source of truth, it tells what page
    // should be rendered because we don't process rewrites in minimalMode
    let { pathname: matchedPath } = new URL(
      req.headers['x-matched-path'] as string,
      'http://localhost'
    )

    let { pathname: urlPathname } = new URL(req.url, 'http://localhost')

    // For ISR the URL is normalized to the prerenderPath so if
    // it's a data request the URL path will be the data URL,
    // basePath is already stripped by this point
    if (this.normalizers.data?.match(urlPathname)) {
      parsedURL.query.__nextDataReq = '1'
    }
    // In minimal mode, if PPR is enabled, then we should check to see if
    // the matched path is a postponed path, and if it is, handle it.
    else if (
      this.normalizers.postponed?.match(matchedPath) &&
      req.method === 'POST'
    ) {
      // Decode the postponed state from the request body, it will come as
      // an array of buffers, so collect them and then concat them to form
      // the string.
      const body: Array<Buffer> = []
      for await (const chunk of req.body) {
        body.push(chunk)
      }
      const postponed = Buffer.concat(body).toString('utf8')

      addRequestMeta(req, 'postponed', postponed)

      // If the request does not have the `x-now-route-matches` header,
      // it means that the request has it's exact path specified in the
      // `x-matched-path` header. In this case, we should update the
      // pathname to the matched path.
      if (!req.headers['x-now-route-matches']) {
        urlPathname = this.normalizers.postponed.normalize(matchedPath, true)
      }
    }

    if (this.normalizers.data?.match(matchedPath)) {
      matchedPath = this.normalizers.data.normalize(matchedPath, true)
    } else if (this.normalizers.postponed?.match(matchedPath)) {
      matchedPath = this.normalizers.postponed.normalize(matchedPath, true)
    } else if (this.normalizers.prefetchRSC?.match(matchedPath)) {
      matchedPath = this.normalizers.prefetchRSC.normalize(matchedPath, true)
    } else if (this.normalizers.rsc?.match(matchedPath)) {
      matchedPath = this.normalizers.rsc.normalize(matchedPath, true)
    } else if (this.normalizers.action?.match(matchedPath)) {
      matchedPath = this.normalizers.action.normalize(matchedPath, true)
    }

    let normalizedUrlPath = urlPathname
    if (this.normalizers.data) {
      normalizedUrlPath = this.normalizers.data.normalize(urlPathname)
    }
    if (this.normalizers.i18n) {
      normalizedUrlPath = this.normalizers.i18n.normalize(urlPathname)
    }

    const domainLocale = this.i18nProvider?.detectDomainLocale(
      getHostname(parsedURL, req.headers)
    )

    addRequestMeta(req, 'isLocaleDomain', Boolean(domainLocale))

    const defaultLocale =
      domainLocale?.defaultLocale ?? this.i18nProvider?.config.defaultLocale

    // Perform locale detection and normalization.
    const localeAnalysisResult = this.i18nProvider?.analyze(matchedPath, {
      defaultLocale,
    })

    // The locale result will be defined even if the locale was not
    // detected for the request because it will be inferred from the
    // default locale.
    if (localeAnalysisResult) {
      parsedURL.query.__nextLocale = localeAnalysisResult.detectedLocale

      // If the detected locale was inferred from the default locale, we
      // need to modify the metadata on the request to indicate that.
      if (localeAnalysisResult.inferredFromDefault) {
        parsedURL.query.__nextInferredLocaleFromDefault = '1'
      } else {
        delete parsedURL.query.__nextInferredLocaleFromDefault
      }
    }

    // TODO: check if this is needed any more?
    matchedPath = denormalizePagePath(matchedPath)

    let srcPathname = matchedPath
    let pageIsDynamic = isDynamicRoute(srcPathname)

    if (!pageIsDynamic) {
      const match = await this.matchers.match(srcPathname, {
        i18n: localeAnalysisResult,
      })

      // Update the source pathname to the matched page's pathname.
      if (match) {
        srcPathname = match.definition.pathname
        // The page is dynamic if the params are defined.
        pageIsDynamic = typeof match.params !== 'undefined'
      }
    }

    // The rest of this function can't handle i18n properly, so ensure we
    // restore the pathname with the locale information stripped from it
    // now that we're done matching if we're using i18n.
    if (localeAnalysisResult) {
      matchedPath = localeAnalysisResult.pathname
    }

    const utils = getUtils({
      pageIsDynamic,
      page: srcPathname,
      i18n: this.nextConfig.i18n,
      basePath: this.nextConfig.basePath,
      rewrites: this.getRoutesManifest()?.rewrites || {
        beforeFiles: [],
        afterFiles: [],
        fallback: [],
      },
      caseSensitive: !!this.nextConfig.experimental.caseSensitiveRoutes,
    })

    // Ensure parsedURL.pathname includes locale before processing
    // rewrites or they won't match correctly.
    if (defaultLocale && !pathnameInfo?.detectedLocale) {
      parsedURL.pathname = `/${defaultLocale}${parsedURL.pathname}`
    }

    const pathnameBeforeRewrite = parsedURL.pathname
    const rewriteParams = utils.handleRewrites(req, parsedURL)
    const rewriteParamKeys = Object.keys(rewriteParams)
    const didRewrite = pathnameBeforeRewrite !== parsedURL.pathname

    if (didRewrite && parsedURL.pathname) {
      addRequestMeta(req, 'rewroteURL', parsedURL.pathname)
    }
    const routeParamKeys = new Set<string>()

    for (const key of Object.keys(parsedURL.query)) {
      const value = parsedURL.query[key]

      normalizeNextQueryParam(key, (normalizedKey) => {
        if (!parsedURL) return // typeguard

        parsedURL.query[normalizedKey] = value
        routeParamKeys.add(normalizedKey)
        delete parsedURL.query[key]
      })
    }

    // interpolate dynamic params and normalize URL if needed
    if (pageIsDynamic) {
      let params: ParsedUrlQuery | false = {}

      let paramsResult = utils.normalizeDynamicRouteParams(parsedURL.query)

      // for prerendered ISR paths we attempt parsing the route
      // params from the URL directly as route-matches may not
      // contain the correct values due to the filesystem path
      // matching before the dynamic route has been matched
      if (
        !paramsResult.hasValidParams &&
        pageIsDynamic &&
        !isDynamicRoute(normalizedUrlPath)
      ) {
        let matcherParams = utils.dynamicRouteMatcher?.(normalizedUrlPath)

        if (matcherParams) {
          utils.normalizeDynamicRouteParams(matcherParams)
          Object.assign(paramsResult.params, matcherParams)
          paramsResult.hasValidParams = true
        }
      }

      if (paramsResult.hasValidParams) {
        params = paramsResult.params
      }

      if (
        req.headers['x-now-route-matches'] &&
        isDynamicRoute(matchedPath) &&
        !paramsResult.hasValidParams
      ) {
        const opts: Record<string, string> = {}
        const routeParams = utils.getParamsFromRouteMatches(
          req,
          opts,
          parsedURL.query.__nextLocale || ''
        )

        // If this returns a locale, it means that the locale was detected
        // from the pathname.
        if (opts.locale) {
          parsedURL.query.__nextLocale = opts.locale

          // As the locale was parsed from the pathname, we should mark
          // that the locale was not inferred as the default.
          delete parsedURL.query.__nextInferredLocaleFromDefault
        }
        paramsResult = utils.normalizeDynamicRouteParams(routeParams, true)

        if (paramsResult.hasValidParams) {
          params = paramsResult.params
        }
      }

      // handle the actual dynamic route name being requested
      if (
        pageIsDynamic &&
        utils.defaultRouteMatches &&
        normalizedUrlPath === srcPathname &&
        !paramsResult.hasValidParams &&
        !utils.normalizeDynamicRouteParams({ ...params }, true).hasValidParams
      ) {
        params = utils.defaultRouteMatches
      }

      if (params) {
        matchedPath = utils.interpolateDynamicPath(srcPathname, params)
        req.url = utils.interpolateDynamicPath(req.url!, params)
      }
    }

    if (pageIsDynamic || didRewrite) {
      utils.normalizeVercelUrl(req, true, [
        ...rewriteParamKeys,
        ...Object.keys(utils.defaultRouteRegex?.groups || {}),
      ])
    }

    for (const key of routeParamKeys) {
      delete parsedURL.query[key]
    }

    parsedURL.pathname = matchedPath
    url.pathname = matchedPath

    // Update the URL with the new pathname if it had a locale.
    if (pathnameInfo?.detectedLocale) {
      req.url = format(url)
    }

    if (!parsedURL.query.__nextLocale) {
      // If the locale is in the pathname, add it to the query string.
      if (pathnameInfo?.detectedLocale) {
        parsedURL.query.__nextLocale = pathnameInfo.detectedLocale
      }
      // If the default locale is available, add it to the query string and
      // mark it as inferred rather than implicit.
      else if (defaultLocale) {
        parsedURL.query.__nextLocale = defaultLocale
        parsedURL.query.__nextInferredLocaleFromDefault = '1'
      }
    }
  }
}
