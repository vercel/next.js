import type { IncomingMessage, ServerResponse } from 'node:http'
import type { InstrumentationOnRequestError } from '../instrumentation/types'
import type { ParsedUrlQuery } from 'node:querystring'
import type { UrlWithParsedQuery } from 'node:url'
import type {
  PrerenderManifest,
  RequiredServerFilesManifest,
} from '../../build'
import type { DevRoutesManifest } from '../lib/router-utils/setup-dev-bundler'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { DeepReadonly } from '../../shared/lib/deep-readonly'

import {
  BUILD_ID_FILE,
  BUILD_MANIFEST,
  CLIENT_REFERENCE_MANIFEST,
  NEXT_FONT_MANIFEST,
  PRERENDER_MANIFEST,
  REACT_LOADABLE_MANIFEST,
  ROUTES_MANIFEST,
  SERVER_FILES_MANIFEST,
  SERVER_REFERENCE_MANIFEST,
  SUBRESOURCE_INTEGRITY_MANIFEST,
} from '../../shared/lib/constants'
import { parseReqUrl } from '../../lib/url'
import {
  normalizeLocalePath,
  type PathLocale,
} from '../../shared/lib/i18n/normalize-locale-path'
import { isDynamicRoute } from '../../shared/lib/router/utils'
import { removePathPrefix } from '../../shared/lib/router/utils/remove-path-prefix'
import { getServerUtils } from '../server-utils'
import { detectDomainLocale } from '../../shared/lib/i18n/detect-domain-locale'
import { getHostname } from '../../shared/lib/get-hostname'
import { checkIsOnDemandRevalidate } from '../api-utils'
import type { PreviewData } from '../../types'
import type { BuildManifest } from '../get-page-files'
import type { ReactLoadableManifest } from '../load-components'
import type { NextFontManifest } from '../../build/webpack/plugins/next-font-manifest-plugin'
import { normalizeDataPath } from '../../shared/lib/page-path/normalize-data-path'
import { pathHasPrefix } from '../../shared/lib/router/utils/path-has-prefix'
import { addRequestMeta, getRequestMeta } from '../request-meta'
import { normalizePagePath } from '../../shared/lib/page-path/normalize-page-path'
import { isStaticMetadataRoute } from '../../lib/metadata/is-metadata-route'

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
  readonly projectDir: string
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
  public isAppRouter?: boolean

  constructor({
    userland,
    definition,
    distDir,
    projectDir,
  }: RouteModuleOptions<D, U>) {
    this.userland = userland
    this.definition = definition
    this.isDev = process.env.NODE_ENV === 'development'
    this.distDir = distDir
    this.projectDir = projectDir
  }

  public async instrumentationOnRequestError(
    req: IncomingMessage,
    ...args: Parameters<InstrumentationOnRequestError>
  ) {
    // this is only handled here for node, for edge it
    // is handled in the adapter/loader instead
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const { join } = require('node:path')
      const projectDir =
        getRequestMeta(req, 'projectDir') ||
        join(process.cwd(), this.projectDir)

      const { instrumentationOnRequestError } = await import(
        '../lib/router-utils/instrumentation-globals.external'
      )

      return instrumentationOnRequestError(projectDir, this.distDir, ...args)
    }
  }

  private async loadManifests(projectDir: string, srcPage: string) {
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const { loadManifestFromRelativePath } = await import(
        '../load-manifest.external'
      )
      const normalizedPagePath = normalizePagePath(srcPage)

      const [
        routesManifest,
        prerenderManifest,
        buildManifest,
        reactLoadableManifest,
        nextFontManifest,
        clientReferenceManifest,
        serverActionsManifest,
        subresourceIntegrityManifest,
        serverFilesManifest,
        buildId,
      ] = await Promise.all([
        loadManifestFromRelativePath<DevRoutesManifest>({
          projectDir,
          distDir: this.distDir,
          manifest: ROUTES_MANIFEST,
        }),
        loadManifestFromRelativePath<PrerenderManifest>({
          projectDir,
          distDir: this.distDir,
          manifest: PRERENDER_MANIFEST,
        }),
        loadManifestFromRelativePath<BuildManifest>({
          projectDir,
          distDir: this.distDir,
          manifest: BUILD_MANIFEST,
        }),
        loadManifestFromRelativePath<ReactLoadableManifest>({
          projectDir,
          distDir: this.distDir,
          manifest: process.env.TURBOPACK
            ? `server/${this.isAppRouter ? 'app' : 'pages'}${normalizedPagePath}/${REACT_LOADABLE_MANIFEST}`
            : REACT_LOADABLE_MANIFEST,
          handleMissing: true,
        }),
        loadManifestFromRelativePath<NextFontManifest>({
          projectDir,
          distDir: this.distDir,
          manifest: `server/${NEXT_FONT_MANIFEST}.json`,
        }),
        this.isAppRouter && !isStaticMetadataRoute(srcPage)
          ? loadManifestFromRelativePath({
              distDir: this.distDir,
              projectDir,
              useEval: true,
              handleMissing: true,
              manifest: `server/app${srcPage.replace(/%5F/g, '_') + '_' + CLIENT_REFERENCE_MANIFEST}.js`,
              shouldCache: !this.isDev,
            })
          : undefined,
        this.isAppRouter
          ? loadManifestFromRelativePath<any>({
              distDir: this.distDir,
              projectDir,
              manifest: `server/${SERVER_REFERENCE_MANIFEST}.json`,
              handleMissing: true,
              shouldCache: !this.isDev,
            })
          : {},
        loadManifestFromRelativePath<Record<string, string>>({
          projectDir,
          distDir: this.distDir,
          manifest: `server/${SUBRESOURCE_INTEGRITY_MANIFEST}.json`,
          handleMissing: true,
          shouldCache: !this.isDev,
        }),
        this.isDev
          ? ({} as any)
          : loadManifestFromRelativePath<RequiredServerFilesManifest>({
              projectDir,
              distDir: this.distDir,
              manifest: SERVER_FILES_MANIFEST,
            }),
        this.isDev
          ? 'development'
          : loadManifestFromRelativePath<any>({
              projectDir,
              distDir: this.distDir,
              manifest: BUILD_ID_FILE,
              skipParse: true,
            }),
      ])

      return {
        buildId,
        buildManifest,
        routesManifest,
        nextFontManifest,
        prerenderManifest,
        serverFilesManifest,
        reactLoadableManifest,
        clientReferenceManifest: (clientReferenceManifest as any)
          ?.__RSC_MANIFEST?.[srcPage.replace(/%5F/g, '_')],
        serverActionsManifest,
        subresourceIntegrityManifest,
      }
    }
    throw new Error('Invariant: loadManifests called for edge runtime')
  }

  public async prepare(
    req: IncomingMessage,
    res: ServerResponse,
    {
      srcPage,
      multiZoneDraftMode,
    }: {
      srcPage: string
      multiZoneDraftMode?: boolean
    }
  ): Promise<
    | {
        buildId: string
        locale?: string
        locales?: readonly string[]
        defaultLocale?: string
        query: ParsedUrlQuery
        originalQuery: ParsedUrlQuery
        originalPathname: string
        params?: ParsedUrlQuery
        parsedUrl: UrlWithParsedQuery
        previewData: PreviewData
        pageIsDynamic: boolean
        isDraftMode: boolean
        isNextDataRequest: boolean
        buildManifest: DeepReadonly<BuildManifest>
        nextFontManifest: DeepReadonly<NextFontManifest>
        serverFilesManifest: DeepReadonly<RequiredServerFilesManifest>
        reactLoadableManifest: DeepReadonly<ReactLoadableManifest>
        routesManifest: DeepReadonly<DevRoutesManifest>
        prerenderManifest: DeepReadonly<PrerenderManifest>
        // we can't pull in the client reference type or it causes issues with
        // our pre-compiled types
        clientReferenceManifest?: any
        serverActionsManifest?: any
        subresourceIntegrityManifest?: DeepReadonly<Record<string, string>>
        isOnDemandRevalidate: boolean
        revalidateOnlyGenerated: boolean
      }
    | undefined
  > {
    // "prepare" is only needed for node runtime currently
    // if we want to share the normalizing logic here
    // we will need to allow passing in the i18n and similar info
    if (process.env.NEXT_RUNTIME !== 'edge') {
      const { join } = require('node:path')
      const projectDir =
        getRequestMeta(req, 'projectDir') ||
        join(process.cwd(), this.projectDir)

      const { ensureInstrumentationRegistered } = await import(
        '../lib/router-utils/instrumentation-globals.external'
      )
      // ensure instrumentation is registered and pass
      // onRequestError below
      ensureInstrumentationRegistered(projectDir, this.distDir)

      const manifests = await this.loadManifests(projectDir, srcPage)
      const { routesManifest, prerenderManifest } = manifests
      const { basePath, i18n, rewrites } = routesManifest

      if (basePath) {
        req.url = removePathPrefix(req.url || '/', basePath)
      }

      const parsedUrl = parseReqUrl(req.url || '/')
      // if we couldn't parse the URL we can't continue
      if (!parsedUrl) {
        return
      }
      let isNextDataRequest = false

      if (pathHasPrefix(parsedUrl.pathname || '/', '/_next/data')) {
        isNextDataRequest = true
        parsedUrl.pathname = normalizeDataPath(parsedUrl.pathname || '/')
      }
      let originalPathname = parsedUrl.pathname || '/'
      const originalQuery = { ...parsedUrl.query }
      const pageIsDynamic = isDynamicRoute(srcPage)

      let localeResult: PathLocale | undefined
      let detectedLocale: string | undefined

      if (i18n) {
        localeResult = normalizeLocalePath(
          parsedUrl.pathname || '/',
          i18n.locales
        )

        if (localeResult.detectedLocale) {
          req.url = `${localeResult.pathname}${parsedUrl.search}`
          originalPathname = localeResult.pathname

          if (!detectedLocale) {
            detectedLocale = localeResult.detectedLocale
          }
        }
      }

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
        detectedLocale
      )
      addRequestMeta(req, 'isLocaleDomain', Boolean(domainLocale))

      const defaultLocale = domainLocale?.defaultLocale || i18n?.defaultLocale

      // Ensure parsedUrl.pathname includes locale before processing
      // rewrites or they won't match correctly.
      if (defaultLocale && !detectedLocale) {
        parsedUrl.pathname = `/${defaultLocale}${parsedUrl.pathname}`
      }
      const locale =
        getRequestMeta(req, 'locale') || detectedLocale || defaultLocale

      const rewriteParamKeys = Object.keys(
        serverUtils.handleRewrites(req, parsedUrl)
      )

      // after processing rewrites we want to remove locale
      // from parsedUrl pathname
      if (i18n) {
        parsedUrl.pathname = normalizeLocalePath(
          parsedUrl.pathname || '/',
          i18n.locales
        ).pathname
      }

      let params: Record<string, undefined | string | string[]> | undefined =
        getRequestMeta(req, 'params')

      // attempt parsing from pathname
      if (!params && serverUtils.dynamicRouteMatcher) {
        const paramsMatch = serverUtils.dynamicRouteMatcher(
          normalizeDataPath(localeResult?.pathname || parsedUrl.pathname || '/')
        )
        const paramsResult = serverUtils.normalizeDynamicRouteParams(
          paramsMatch || {},
          true
        )

        if (paramsResult.hasValidParams) {
          params = paramsResult.params
        }
      }

      // Local "next start" expects the routing parsed query values
      // to not be present in the URL although when deployed proxies
      // will add query values from resolving the routes to pass to function.

      // TODO: do we want to change expectations for "next start"
      // to include these query values in the URL which affects asPath
      // but would match deployed behavior, e.g. a rewrite from middleware
      // that adds a query param would be in asPath as query but locally
      // it won't be in the asPath but still available in the query object
      const query = getRequestMeta(req, 'query') || {
        ...parsedUrl.query,
      }

      const routeParamKeys = new Set<string>()
      const combinedParamKeys = [...routeParamKeys]

      for (const key of rewriteParamKeys) {
        // We only want to filter rewrite param keys from the URL
        // if they are matches from the URL e.g. the key/value matches
        // before and after applying the rewrites /:path for /hello and
        // { path: 'hello' } but not for { path: 'another' } and /hello
        // TODO: we should prefix rewrite param keys the same as we do
        // for dynamic routes so we can identify them properly
        const originalValue = Array.isArray(originalQuery[key])
          ? originalQuery[key].join('')
          : originalQuery[key]

        const queryValue = Array.isArray(query[key])
          ? query[key].join('')
          : query[key]

        if (!(key in originalQuery) || originalValue === queryValue) {
          combinedParamKeys.push(key)
        }
      }

      serverUtils.normalizeCdnUrl(req, combinedParamKeys)
      serverUtils.normalizeQueryParams(query, routeParamKeys)
      serverUtils.filterInternalQuery(originalQuery, combinedParamKeys)

      if (pageIsDynamic) {
        const queryResult = serverUtils.normalizeDynamicRouteParams(query, true)

        req.url = serverUtils.interpolateDynamicPath(
          req.url || '/',
          params || query
        )
        parsedUrl.pathname = serverUtils.interpolateDynamicPath(
          parsedUrl.pathname || '/',
          params || query
        )
        originalPathname = serverUtils.interpolateDynamicPath(
          originalPathname,
          params || query
        )

        // try pulling from query if valid
        if (!params) {
          if (queryResult.hasValidParams) {
            params = Object.assign({}, queryResult.params)

            // If we pulled from query remove it so it's
            // only in params
            for (const key in serverUtils.defaultRouteMatches) {
              delete query[key]
            }
          } else {
            // use final params from URL matching
            const paramsMatch = serverUtils.dynamicRouteMatcher?.(
              normalizeDataPath(
                localeResult?.pathname || parsedUrl.pathname || '/'
              )
            )
            // we don't normalize these as they are allowed to be
            // the literal slug matches here e.g. /blog/[slug]
            // actually being requested
            if (paramsMatch) {
              params = Object.assign({}, paramsMatch)
            }
          }
        }
      }

      // Remove any normalized params from the query if they
      // weren't present as non-prefixed query key e.g.
      // ?search=1&nxtPsearch=hello we don't delete search
      for (const key of routeParamKeys) {
        if (!(key in originalQuery)) {
          delete query[key]
        }
      }

      const { isOnDemandRevalidate, revalidateOnlyGenerated } =
        checkIsOnDemandRevalidate(req, prerenderManifest.preview)

      let isDraftMode = false
      let previewData: PreviewData

      const { tryGetPreviewData } =
        require('../api-utils/node/try-get-preview-data') as typeof import('../api-utils/node/try-get-preview-data')

      previewData = tryGetPreviewData(
        req,
        res,
        prerenderManifest.preview,
        Boolean(multiZoneDraftMode)
      )
      isDraftMode = previewData !== false

      return {
        query,
        originalQuery,
        originalPathname,
        params,
        parsedUrl,
        locale,
        isNextDataRequest,
        locales: i18n?.locales,
        defaultLocale,
        isDraftMode,
        previewData,
        pageIsDynamic,
        isOnDemandRevalidate,
        revalidateOnlyGenerated,
        ...manifests,
        serverActionsManifest: manifests.serverActionsManifest,
        clientReferenceManifest: manifests.clientReferenceManifest,
      }
    }
  }
}
