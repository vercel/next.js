import type { IncomingMessage } from 'node:http'
import type { InstrumentationOnRequestError } from '../instrumentation/types'
import type { ParsedUrlQuery } from 'node:querystring'
import type { UrlWithParsedQuery } from 'node:url'
import type { PrerenderManifest } from '../../build'
import type { DevRoutesManifest } from '../lib/router-utils/setup-dev-bundler'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'

import { PRERENDER_MANIFEST, ROUTES_MANIFEST } from '../../shared/lib/constants'
import { parseReqUrl } from '../../lib/url'
import {
  normalizeLocalePath,
  type PathLocale,
} from '../../shared/lib/i18n/normalize-locale-path'
import { isDynamicRoute } from '../../shared/lib/router/utils'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import {
  RouterServerContextSymbol,
  routerServerGlobal,
} from '../lib/router-utils/router-server-context'
import { getServerUtils } from '../server-utils'
import { detectDomainLocale } from '../../shared/lib/i18n/detect-domain-locale'
import { getHostname } from '../../shared/lib/get-hostname'

/**
 * RouteModuleOptions is the options that are passed to the route module, other
 * route modules should extend this class to add specific options for their
 * route.
 */
export interface RouteModuleOptions<
  D extends RouteDefinition = RouteDefinition,
  U = unknown,
> {
  readonly definition: Readonly<D>
  readonly userland: Readonly<U>
  readonly distDir: string
}

/**
 * RouteHandlerContext is the base context for a route handler.
 */
export interface RouteModuleHandleContext {
  /**
   * Any matched parameters for the request. This is only defined for dynamic
   * routes.
   */
  params: Record<string, string | string[] | undefined> | undefined
}

/**
 * RouteModule is the base class for all route modules. This class should be
 * extended by all route modules.
 */
export abstract class RouteModule<
  D extends RouteDefinition = RouteDefinition,
  U = unknown,
> {
  /**
   * The userland module. This is the module that is exported from the user's
   * code. This is marked as readonly to ensure that the module is not mutated
   * because the module (when compiled) only provides getters.
   */
  public readonly userland: Readonly<U>

  /**
   * The definition of the route.
   */
  public readonly definition: Readonly<D>

  /**
   * The shared modules that are exposed and required for the route module.
   */
  public static readonly sharedModules: any

  public isDev: boolean
  public distDir: string
  public projectDir: string

  constructor({ userland, definition, distDir }: RouteModuleOptions<D, U>) {
    this.userland = userland
    this.definition = definition
    this.isDev = process.env.NODE_ENV === 'development'
    this.distDir = distDir

    if (process.env.NEXT_RUNTIME === 'edge') {
      this.projectDir = ''
    } else {
      this.projectDir =
        routerServerGlobal[RouterServerContextSymbol]?.dir || process.cwd()
    }
  }

  public async instrumentationOnRequestError(
    ...args: Parameters<InstrumentationOnRequestError>
  ) {
    // this is only handled here for node, for edge it
    // is handled in the adapter/loader instead
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const { instrumentationOnRequestError } = await import(
        '../lib/router-utils/instrumentation-globals.external'
      )

      return instrumentationOnRequestError(
        this.projectDir,
        this.distDir,
        ...args
      )
    }
  }

  public async prepare(
    req: IncomingMessage,
    srcPage: string
  ): Promise<
    | {
        query: ParsedUrlQuery
        params: ParsedUrlQuery
        parsedUrl: UrlWithParsedQuery
        routesManifest: DeepReadonly<DevRoutesManifest>
        prerenderManifest: DeepReadonly<PrerenderManifest>
      }
    | undefined
  > {
    // "prepare" is only needed for node runtime currently
    // if we want to share the normalizing logic here
    // we ill need to allow passing in the i18n and similar info
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const { loadManifestFromRelativePath } = await import(
        '../load-manifest.external'
      )
      const { ensureInstrumentationRegistered } = await import(
        '../lib/router-utils/instrumentation-globals.external'
      )

      const [routesManifest, prerenderManifest] = await Promise.all([
        loadManifestFromRelativePath<DevRoutesManifest>(
          this.projectDir,
          this.distDir,
          ROUTES_MANIFEST
        ),
        loadManifestFromRelativePath<PrerenderManifest>(
          this.projectDir,
          this.distDir,
          PRERENDER_MANIFEST
        ),
        // ensure instrumentation is registered and pass
        // onRequestError below
        ensureInstrumentationRegistered(this.projectDir, this.distDir),
      ])
      // We need to parse dynamic route params
      // and do URL normalization here.
      // TODO: move this into server-utils for re-use
      const { basePath, i18n, rewrites } = routesManifest

      if (basePath) {
        req.url = removePathPrefix(req.url || '/', basePath)
      }

      let localeResult: PathLocale | undefined

      if (i18n) {
        const urlParts = (req.url || '/').split('?')
        localeResult = normalizeLocalePath(urlParts[0] || '/', i18n.locales)

        if (localeResult.detectedLocale) {
          req.url = `${localeResult.pathname}${
            urlParts[1] ? `?${urlParts[1]}` : ''
          }`
        }
      }

      const parsedUrl = parseReqUrl(req.url || '/')

      // if we couldn't parse the URL we can't continue
      if (!parsedUrl) {
        return
      }

      const pageIsDynamic = isDynamicRoute(srcPage)

      const serverUtils = getServerUtils({
        page: srcPage,
        i18n,
        basePath,
        rewrites,
        pageIsDynamic,
        trailingSlash: process.env.__NEXT_TRAILING_SLASH as any as boolean,
        caseSensitive: Boolean(routesManifest.caseSensitive),
      })

      const domainLocale = detectDomainLocale(
        i18n?.domains,
        getHostname(parsedUrl, req.headers),
        localeResult?.detectedLocale
      )

      const defaultLocale = domainLocale?.defaultLocale || i18n?.defaultLocale

      // Ensure parsedUrl.pathname includes locale before processing
      // rewrites or they won't match correctly.
      if (defaultLocale && !localeResult?.detectedLocale) {
        parsedUrl.pathname = `/${defaultLocale}${parsedUrl.pathname}`
      }

      const rewriteParamKeys = Object.keys(
        serverUtils.handleRewrites(req, parsedUrl)
      )
      serverUtils.normalizeCdnUrl(req, [
        ...rewriteParamKeys,
        ...Object.keys(serverUtils.defaultRouteRegex?.groups || {}),
      ])

      const params: Record<string, undefined | string | string[]> =
        serverUtils.dynamicRouteMatcher
          ? serverUtils.dynamicRouteMatcher(
              localeResult?.pathname || parsedUrl.pathname || ''
            ) || {}
          : {}

      const query = {
        ...parsedUrl.query,
        ...params,
      }
      serverUtils.normalizeQueryParams(query)

      if (pageIsDynamic) {
        const result = serverUtils.normalizeDynamicRouteParams(query, true)

        if (result.hasValidParams) {
          Object.assign(query, result.params)
        }
      }

      return {
        query,
        params,
        parsedUrl,
        routesManifest,
        prerenderManifest,
      }
    }
  }
}
