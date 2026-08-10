import type {
  Route,
  ResolveRoutesParams,
  ResolveRoutesQuery,
  ResolveRoutesResult,
} from './types'
import { checkHasConditions, checkMissingConditions } from './matchers'
import {
  replaceDestination,
  isExternalDestination,
  applyDestination,
  isRedirectStatus,
  hasRedirectHeaders,
} from './destination'
import { normalizeNextDataUrl, denormalizeNextDataUrl } from './next-data'
import { detectLocale, detectDomainLocale, normalizeLocalePath } from './i18n'

function getHeaderValueCaseInsensitive(
  headers: Record<string, string>,
  targetHeader: string
): string | undefined {
  const targetHeaderLower = targetHeader.toLowerCase()
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === targetHeaderLower) {
      return value
    }
  }
  return undefined
}

function resolveRedirectLocationWithRequestQuery(
  locationHeader: string,
  requestUrl: URL
): string {
  if (!requestUrl.search) {
    return locationHeader
  }

  try {
    const resolvedLocation = new URL(locationHeader, requestUrl)
    if (resolvedLocation.search) {
      return locationHeader
    }

    resolvedLocation.search = requestUrl.search
    if (resolvedLocation.origin !== requestUrl.origin) {
      return resolvedLocation.toString()
    }

    return `${resolvedLocation.pathname}${resolvedLocation.search}${resolvedLocation.hash}`
  } catch {
    return locationHeader
  }
}

/**
 * Attempts to match a route against the current URL and conditions
 */
function matchRoute(
  route: Route,
  url: URL,
  headers: Headers,
  caseSensitive: boolean
): {
  matched: boolean
  destination?: string
  headers?: Record<string, string>
  regexMatches?: RegExpMatchArray
  hasCaptures?: Record<string, string>
} {
  // Check if source regex matches the pathname
  const regex = new RegExp(route.sourceRegex, caseSensitive ? '' : 'i')
  const regexMatches = url.pathname.match(regex)

  if (!regexMatches) {
    return { matched: false }
  }

  // Check has conditions
  const hasResult = checkHasConditions(route.has, url, headers)
  if (!hasResult.matched) {
    return { matched: false }
  }

  // Check missing conditions
  const missingMatched = checkMissingConditions(route.missing, url, headers)
  if (!missingMatched) {
    return { matched: false }
  }

  // Replace placeholders in destination
  const destination = route.destination
    ? replaceDestination(route.destination, regexMatches, hasResult.captures)
    : undefined
  const resolvedHeaders = route.headers
    ? Object.fromEntries(
        Object.entries(route.headers).map(([key, value]) => [
          replaceDestination(key, regexMatches, hasResult.captures),
          replaceDestination(value, regexMatches, hasResult.captures),
        ])
      )
    : undefined

  return {
    matched: true,
    destination,
    headers: resolvedHeaders,
    regexMatches,
    hasCaptures: hasResult.captures,
  }
}

/**
 * Processes a list of routes and updates the URL if any match
 */
function processRoutes(
  routes: Route[],
  url: URL,
  requestHeaders: Headers,
  responseHeaders: Headers,
  initialOrigin: string,
  caseSensitive: boolean
): {
  url: URL
  externalRewrite?: URL
  redirect?: {
    url: URL
    status: number
  }
  stopped: boolean
  status?: number
} {
  let currentUrl = url
  let currentStatus: number | undefined

  for (const route of routes) {
    const match = matchRoute(route, currentUrl, requestHeaders, caseSensitive)

    if (match.matched) {
      if (match.headers) {
        for (const [key, value] of Object.entries(match.headers)) {
          responseHeaders.set(key, value)
        }
      }

      if (route.status) {
        currentStatus = route.status
      }

      if (
        isRedirectStatus(route.status) &&
        match.headers &&
        hasRedirectHeaders(match.headers)
      ) {
        if (match.destination) {
          const redirectUrl = isExternalDestination(match.destination)
            ? new URL(match.destination)
            : applyDestination(currentUrl, match.destination)

          return {
            url: currentUrl,
            redirect: {
              url: redirectUrl,
              status: route.status!,
            },
            stopped: true,
            status: currentStatus,
          }
        }

        const locationHeader = getHeaderValueCaseInsensitive(
          match.headers,
          'location'
        )
        if (locationHeader) {
          responseHeaders.set(
            'location',
            resolveRedirectLocationWithRequestQuery(locationHeader, currentUrl)
          )
        }

        return {
          url: currentUrl,
          stopped: true,
          status: currentStatus,
        }
      }

      if (match.destination) {
        // Check if it's an external rewrite
        if (isExternalDestination(match.destination)) {
          return {
            url: currentUrl,
            externalRewrite: new URL(match.destination),
            stopped: true,
            status: currentStatus,
          }
        }

        // Apply the destination to update the URL
        currentUrl = applyDestination(currentUrl, match.destination)

        // Check if origin changed (external rewrite)
        if (currentUrl.origin !== initialOrigin) {
          return {
            url: currentUrl,
            externalRewrite: currentUrl,
            stopped: true,
            status: currentStatus,
          }
        }
      }
    }
  }

  return { url: currentUrl, stopped: false, status: currentStatus }
}

/**
 * Checks if the current pathname matches any of the provided pathnames
 */
function matchesPathname(
  pathname: string,
  pathnames: string[]
): string | undefined {
  for (const candidate of pathnames) {
    if (pathname === candidate) {
      return candidate
    }
  }
  return undefined
}

function matchesPathnameWithLocaleFallback({
  pathname,
  pathnames,
  basePath,
  i18n,
}: {
  pathname: string
  pathnames: string[]
  basePath: string
  i18n?: ResolveRoutesParams['i18n']
}): string | undefined {
  const directMatch = matchesPathname(pathname, pathnames)
  if (directMatch || !i18n) {
    return directMatch
  }

  const withoutBasePath =
    basePath && pathname.startsWith(basePath)
      ? pathname.slice(basePath.length) || '/'
      : pathname

  for (const locale of i18n.locales) {
    const localePrefix = `/${locale}`
    if (
      withoutBasePath !== localePrefix &&
      !withoutBasePath.startsWith(`${localePrefix}/`)
    ) {
      continue
    }

    const withoutLocale =
      withoutBasePath === localePrefix
        ? '/'
        : withoutBasePath.slice(localePrefix.length) || '/'
    const localeFallbackPathname = basePath
      ? `${basePath}${withoutLocale}`
      : withoutLocale

    const localeFallbackMatch = matchesPathname(
      localeFallbackPathname,
      pathnames
    )
    if (localeFallbackMatch) {
      return localeFallbackMatch
    }
  }

  return undefined
}

function isDynamicTemplatePathname(pathname: string): boolean {
  return /\[[^/]+?\]/.test(pathname)
}

function toResolvedQuery(url: URL): ResolveRoutesQuery {
  const query: ResolveRoutesQuery = {}
  for (const [key, value] of url.searchParams.entries()) {
    const existing = query[key]
    if (existing === undefined) {
      query[key] = value
      continue
    }
    query[key] = Array.isArray(existing)
      ? [...existing, value]
      : [existing, value]
  }
  return query
}

function mergeDestinationQueryIntoUrl(url: URL, destination: string): URL {
  const mergedUrl = new URL(url.toString())
  const destinationSearch = destination.split('?')[1]
  if (!destinationSearch) {
    return mergedUrl
  }

  const destinationParams = new URLSearchParams(destinationSearch)
  for (const [key, value] of destinationParams.entries()) {
    mergedUrl.searchParams.set(key, value)
  }
  return mergedUrl
}

function withResolvedInvocationTarget({
  result,
  url,
  resolvedPathname,
  invocationPathname,
}: {
  result: ResolveRoutesResult
  url: URL
  resolvedPathname: string
  invocationPathname: string
}): ResolveRoutesResult {
  const resolvedQuery = toResolvedQuery(url)
  return {
    ...result,
    resolvedPathname,
    resolvedQuery,
    invocationTarget: {
      pathname: invocationPathname,
      query: resolvedQuery,
    },
  }
}

/**
 * Matches dynamic routes and extracts route parameters
 */
function matchDynamicRoute(
  pathname: string,
  route: Route,
  caseSensitive: boolean
): {
  matched: boolean
  params?: Record<string, string>
  regexMatches?: RegExpMatchArray
} {
  const regex = new RegExp(route.sourceRegex, caseSensitive ? '' : 'i')
  const match = pathname.match(regex)

  if (!match) {
    return { matched: false }
  }

  const params: Record<string, string> = {}

  // Add numbered matches
  for (let i = 1; i < match.length; i++) {
    if (match[i] !== undefined) {
      params[String(i)] = match[i]
    }
  }

  // Add named matches
  if (match.groups) {
    Object.assign(params, match.groups)
  }

  return { matched: true, params, regexMatches: match }
}

/**
 * Applies headers from onMatch routes
 */
function applyOnMatchHeaders(
  routes: Route[],
  url: URL,
  requestHeaders: Headers,
  responseHeaders: Headers,
  caseSensitive: boolean
): Headers {
  const newHeaders = new Headers(responseHeaders)

  for (const route of routes) {
    const match = matchRoute(route, url, requestHeaders, caseSensitive)

    if (match.matched && match.headers) {
      for (const [key, value] of Object.entries(match.headers)) {
        newHeaders.set(key, value)
      }
    }
  }

  return newHeaders
}

/**
 * Checks dynamic routes for a match and returns result if found
 */
function checkDynamicRoutes(
  dynamicRoutes: Route[],
  url: URL,
  pathnames: string[],
  requestHeaders: Headers,
  responseHeaders: Headers,
  onMatchRoutes: Route[],
  basePath: string,
  buildId: string,
  i18n: ResolveRoutesParams['i18n'],
  shouldNormalizeNextData?: boolean,
  isDataUrl?: boolean,
  caseSensitive: boolean = false
): {
  matched: boolean
  result?: ResolveRoutesResult
  resetUrl?: URL
} {
  // Denormalize before checking dynamic routes if this was originally a data URL
  let checkUrl = url
  if (isDataUrl && shouldNormalizeNextData) {
    checkUrl = denormalizeNextDataUrl(url, basePath, buildId)
  }

  for (const route of dynamicRoutes) {
    const match = matchDynamicRoute(checkUrl.pathname, route, caseSensitive)

    if (match.matched) {
      // Check has/missing conditions
      const hasResult = checkHasConditions(route.has, checkUrl, requestHeaders)
      const missingMatched = checkMissingConditions(
        route.missing,
        checkUrl,
        requestHeaders
      )

      if (hasResult.matched && missingMatched) {
        const replacedDestination = route.destination
          ? replaceDestination(
              route.destination,
              match.regexMatches || null,
              hasResult.captures
            )
          : undefined
        // Check if the destination pathname (template path) is in the provided pathnames list
        // For dynamic routes, the destination contains the template path like /dynamic/[slug]
        const pathnameToCheck = replacedDestination
          ? replacedDestination.split('?')[0]
          : checkUrl.pathname
        const matchedPath = matchesPathnameWithLocaleFallback({
          pathname: pathnameToCheck,
          pathnames,
          basePath,
          i18n,
        })
        if (matchedPath) {
          const resolvedUrl = replacedDestination
            ? mergeDestinationQueryIntoUrl(checkUrl, replacedDestination)
            : checkUrl
          const finalHeaders = applyOnMatchHeaders(
            onMatchRoutes,
            resolvedUrl,
            requestHeaders,
            responseHeaders,
            caseSensitive
          )
          const result = withResolvedInvocationTarget({
            result: {
              routeMatches: match.params,
              resolvedHeaders: finalHeaders,
            },
            url: resolvedUrl,
            resolvedPathname: matchedPath,
            invocationPathname: checkUrl.pathname,
          })
          return {
            matched: true,
            result,
            resetUrl: checkUrl, // Return the denormalized URL to reset to
          }
        }
      }
    }
  }

  return { matched: false }
}

function shouldInvokeMiddlewareForRequest(
  middlewareMatchers: Route[] | undefined,
  url: URL,
  requestHeaders: Headers,
  caseSensitive: boolean
): boolean {
  const matchesMiddlewareMatchers = (candidatePathname: string): boolean => {
    if (!middlewareMatchers || middlewareMatchers.length === 0) {
      return false
    }

    for (const matcher of middlewareMatchers) {
      const regex = new RegExp(matcher.sourceRegex, caseSensitive ? '' : 'i')
      const regexMatches = candidatePathname.match(regex)
      if (!regexMatches) {
        continue
      }

      const hasResult = checkHasConditions(matcher.has, url, requestHeaders)
      if (!hasResult.matched) {
        continue
      }

      const missingMatched = checkMissingConditions(
        matcher.missing,
        url,
        requestHeaders
      )
      if (!missingMatched) {
        continue
      }

      return true
    }

    return false
  }

  // Preserve legacy behavior for callers that don't yet provide matchers.
  if (middlewareMatchers === undefined) {
    return true
  }

  if (middlewareMatchers.length === 0) {
    return false
  }

  if (matchesMiddlewareMatchers(url.pathname)) {
    return true
  }

  let decodedPathname = url.pathname
  try {
    decodedPathname = decodeURIComponent(url.pathname)
  } catch {
    return false
  }

  if (decodedPathname === url.pathname) {
    return false
  }

  return matchesMiddlewareMatchers(decodedPathname)
}

export async function resolveRoutes(
  params: ResolveRoutesParams
): Promise<ResolveRoutesResult> {
  const {
    url: initialUrl,
    basePath,
    requestBody,
    headers: initialHeaders,
    pathnames,
    routes,
    invokeMiddleware,
    buildId,
    i18n,
  } = params

  const { shouldNormalizeNextData, caseSensitive = false } = routes

  let currentUrl = new URL(initialUrl.toString())
  let currentRequestHeaders = new Headers(initialHeaders)
  let currentResponseHeaders = new Headers()
  let currentStatus: number | undefined
  let pendingLocaleRedirect:
    | {
        url: URL
        status: number
      }
    | undefined
  let pendingBeforeMiddlewareStop:
    | {
        status: number | undefined
      }
    | undefined
  const initialOrigin = initialUrl.origin

  // Check if the original URL is a data URL and normalize if so
  let isDataUrl = false
  if (shouldNormalizeNextData) {
    const dataPrefix = `${basePath}/_next/data/${buildId}/`
    isDataUrl = initialUrl.pathname.startsWith(dataPrefix)

    if (isDataUrl) {
      currentUrl = normalizeNextDataUrl(currentUrl, basePath, buildId)
    }
  }

  // Handle i18n locale detection and redirects
  if (i18n && !isDataUrl) {
    const pathname = currentUrl.pathname.startsWith(basePath)
      ? currentUrl.pathname.slice(basePath.length) || '/'
      : currentUrl.pathname

    // Skip locale handling for _next and api routes
    if (!pathname.startsWith('/_next/') && !pathname.startsWith('/api/')) {
      const hostname = currentUrl.hostname
      const cookieHeader = currentRequestHeaders.get('cookie') || undefined
      const acceptLanguageHeader =
        currentRequestHeaders.get('accept-language') || undefined

      // Detect locale from path first
      const pathLocaleResult = normalizeLocalePath(pathname, i18n.locales)
      const localeInPath = !!pathLocaleResult.detectedLocale

      // Detect domain locale
      const domainLocale = detectDomainLocale(i18n.domains, hostname)
      const defaultLocale = domainLocale?.defaultLocale || i18n.defaultLocale

      // Determine target locale if locale detection is enabled
      let targetLocale = pathLocaleResult.detectedLocale || defaultLocale

      // Match Next.js behavior: preferred-locale auto-detection redirects only
      // on index requests, not on arbitrary non-locale pathnames.
      const shouldDetectPreferredLocale =
        i18n.localeDetection !== false &&
        !localeInPath &&
        pathLocaleResult.pathname === '/'

      if (shouldDetectPreferredLocale) {
        const detectedResult = detectLocale({
          pathname,
          hostname,
          cookieHeader,
          acceptLanguageHeader,
          i18n,
        })

        targetLocale = detectedResult.locale

        // Check if we need to redirect based on domain or locale mismatch
        if (targetLocale !== defaultLocale) {
          const targetDomain = detectDomainLocale(
            i18n.domains,
            undefined,
            targetLocale
          )

          // Redirect to different domain if target locale has a different configured domain
          if (targetDomain && targetDomain.domain !== hostname) {
            const scheme = targetDomain.http ? 'http' : 'https'
            const localePrefix =
              targetLocale === targetDomain.defaultLocale
                ? ''
                : `/${targetLocale}`
            const redirectUrl = new URL(
              `${scheme}://${targetDomain.domain}${basePath}${localePrefix}${pathname}${currentUrl.search}`
            )

            pendingLocaleRedirect = {
              url: redirectUrl,
              status: 307,
            }
          }

          // If no dedicated domain for target locale, or we're already on the right domain,
          // redirect to add locale prefix on same domain
          if (
            !targetDomain ||
            (targetDomain && targetDomain.domain === hostname)
          ) {
            const redirectUrl = new URL(currentUrl.toString())
            redirectUrl.pathname = `${basePath}/${targetLocale}${pathname}`

            pendingLocaleRedirect = {
              url: redirectUrl,
              status: 307,
            }
          }
        }
      }

      // Prefix the locale internally for route resolution (without redirecting)
      if (!localeInPath && !pendingLocaleRedirect) {
        const localeToPrefix =
          targetLocale || domainLocale?.defaultLocale || i18n.defaultLocale
        currentUrl.pathname = `${basePath}/${localeToPrefix}${pathname}`
      }
    }
  }

  // Process beforeMiddleware routes
  const beforeMiddlewareResult = processRoutes(
    routes.beforeMiddleware,
    currentUrl,
    currentRequestHeaders,
    currentResponseHeaders,
    initialOrigin,
    caseSensitive
  )

  if (beforeMiddlewareResult.status) {
    currentStatus = beforeMiddlewareResult.status
  }

  if (beforeMiddlewareResult.redirect) {
    return {
      redirect: beforeMiddlewareResult.redirect,
      resolvedHeaders: currentResponseHeaders,
      status: currentStatus,
    }
  }

  if (beforeMiddlewareResult.externalRewrite) {
    return {
      externalRewrite: beforeMiddlewareResult.externalRewrite,
      resolvedHeaders: currentResponseHeaders,
      status: currentStatus,
    }
  }

  if (beforeMiddlewareResult.stopped) {
    pendingBeforeMiddlewareStop = {
      status: currentStatus,
    }
  }

  currentUrl = beforeMiddlewareResult.url

  let middlewareInvocationUrl = currentUrl

  // Denormalize before invoking middleware if this was originally a data URL
  if (isDataUrl && shouldNormalizeNextData) {
    middlewareInvocationUrl = denormalizeNextDataUrl(
      currentUrl,
      basePath,
      buildId
    )
  }

  const shouldInvokeMiddleware = shouldInvokeMiddlewareForRequest(
    routes.middlewareMatchers,
    currentUrl,
    currentRequestHeaders,
    caseSensitive
  )

  if (shouldInvokeMiddleware) {
    // Invoke middleware
    const middlewareResult = await invokeMiddleware({
      url: middlewareInvocationUrl,
      headers: currentRequestHeaders,
      requestBody,
    })

    // Check if middleware sent the response body
    if (middlewareResult.bodySent) {
      return { middlewareResponded: true }
    }

    // Apply request headers from middleware
    if (middlewareResult.requestHeaders) {
      currentRequestHeaders = new Headers(middlewareResult.requestHeaders)
    }

    // Apply response headers from middleware
    if (middlewareResult.responseHeaders) {
      middlewareResult.responseHeaders.forEach((value, key) => {
        if (key.toLowerCase() === 'set-cookie') {
          currentResponseHeaders.append(key, value)
        } else {
          currentResponseHeaders.set(key, value)
        }
      })
    }

    // Handle middleware redirect
    if (middlewareResult.redirect) {
      if (!currentResponseHeaders.has('location')) {
        currentResponseHeaders.set(
          'Location',
          middlewareResult.redirect.url.toString()
        )
      }
      return {
        resolvedHeaders: currentResponseHeaders,
        status: middlewareResult.redirect.status,
      }
    }

    // Handle middleware rewrite
    if (middlewareResult.rewrite) {
      currentUrl = middlewareResult.rewrite

      // Check if it's an external rewrite
      if (currentUrl.origin !== initialOrigin) {
        return {
          externalRewrite: currentUrl,
          resolvedHeaders: currentResponseHeaders,
          status: currentStatus,
        }
      }
    }
  }

  if (pendingLocaleRedirect) {
    if (!currentResponseHeaders.has('location')) {
      currentResponseHeaders.set(
        'location',
        pendingLocaleRedirect.url.toString()
      )
    }
    return {
      redirect: pendingLocaleRedirect,
      resolvedHeaders: currentResponseHeaders,
    }
  }

  if (pendingBeforeMiddlewareStop) {
    return {
      resolvedHeaders: currentResponseHeaders,
      status: pendingBeforeMiddlewareStop.status,
    }
  }

  // Normalize again after middleware if this was originally a data URL
  if (isDataUrl && shouldNormalizeNextData) {
    currentUrl = normalizeNextDataUrl(currentUrl, basePath, buildId)
  }

  // Process beforeFiles routes
  const beforeFilesResult = processRoutes(
    routes.beforeFiles,
    currentUrl,
    currentRequestHeaders,
    currentResponseHeaders,
    initialOrigin,
    caseSensitive
  )

  if (beforeFilesResult.status) {
    currentStatus = beforeFilesResult.status
  }

  if (beforeFilesResult.redirect) {
    return {
      redirect: beforeFilesResult.redirect,
      resolvedHeaders: currentResponseHeaders,
      status: currentStatus,
    }
  }

  if (beforeFilesResult.externalRewrite) {
    return {
      externalRewrite: beforeFilesResult.externalRewrite,
      resolvedHeaders: currentResponseHeaders,
      status: currentStatus,
    }
  }

  if (beforeFilesResult.stopped) {
    return {
      resolvedHeaders: currentResponseHeaders,
      status: currentStatus,
    }
  }

  currentUrl = beforeFilesResult.url

  // Denormalize before checking pathnames if this was originally a data URL
  if (isDataUrl && shouldNormalizeNextData) {
    currentUrl = denormalizeNextDataUrl(currentUrl, basePath, buildId)
  }

  // Check if pathname matches any provided pathnames (pathnames are in denormalized form)
  let matchedPath = matchesPathname(currentUrl.pathname, pathnames)
  if (matchedPath) {
    for (const route of routes.dynamicRoutes) {
      const match = matchDynamicRoute(currentUrl.pathname, route, caseSensitive)

      if (!match.matched) {
        continue
      }

      const hasResult = checkHasConditions(
        route.has,
        currentUrl,
        currentRequestHeaders
      )
      const missingMatched = checkMissingConditions(
        route.missing,
        currentUrl,
        currentRequestHeaders
      )

      if (!hasResult.matched || !missingMatched) {
        continue
      }

      const replacedDestination = route.destination
        ? replaceDestination(
            route.destination,
            match.regexMatches || null,
            hasResult.captures
          )
        : undefined
      const pathnameToCheck = replacedDestination
        ? replacedDestination.split('?')[0]
        : currentUrl.pathname
      const dynamicMatchedPath = matchesPathnameWithLocaleFallback({
        pathname: pathnameToCheck,
        pathnames,
        basePath,
        i18n,
      })
      if (!dynamicMatchedPath) {
        // When a dynamic route rewrites to a non-template/static destination
        // that isn't part of pathnames, preserve route params for the currently
        // matched concrete pathname.
        if (isDynamicTemplatePathname(pathnameToCheck)) {
          continue
        }

        const resolvedUrl = replacedDestination
          ? mergeDestinationQueryIntoUrl(currentUrl, replacedDestination)
          : currentUrl
        const finalHeaders = applyOnMatchHeaders(
          routes.onMatch,
          resolvedUrl,
          currentRequestHeaders,
          currentResponseHeaders,
          caseSensitive
        )
        return withResolvedInvocationTarget({
          result: {
            routeMatches: match.params,
            resolvedHeaders: finalHeaders,
            status: currentStatus,
          },
          url: resolvedUrl,
          resolvedPathname: matchedPath,
          invocationPathname: currentUrl.pathname,
        })
      }

      const shouldUseDynamicMatch =
        dynamicMatchedPath === matchedPath ||
        isDynamicTemplatePathname(matchedPath)
      if (!shouldUseDynamicMatch) {
        continue
      }

      const resolvedUrl = replacedDestination
        ? mergeDestinationQueryIntoUrl(currentUrl, replacedDestination)
        : currentUrl
      const finalHeaders = applyOnMatchHeaders(
        routes.onMatch,
        resolvedUrl,
        currentRequestHeaders,
        currentResponseHeaders,
        caseSensitive
      )
      return withResolvedInvocationTarget({
        result: {
          routeMatches: match.params,
          resolvedHeaders: finalHeaders,
          status: currentStatus,
        },
        url: resolvedUrl,
        resolvedPathname: dynamicMatchedPath,
        invocationPathname: currentUrl.pathname,
      })
    }

    // No dynamic route matched, return without route matches
    const finalHeaders = applyOnMatchHeaders(
      routes.onMatch,
      currentUrl,
      currentRequestHeaders,
      currentResponseHeaders,
      caseSensitive
    )
    return withResolvedInvocationTarget({
      result: {
        resolvedHeaders: finalHeaders,
        status: currentStatus,
      },
      url: currentUrl,
      resolvedPathname: matchedPath,
      invocationPathname: currentUrl.pathname,
    })
  }

  // Normalize again before processing afterFiles if this was originally a data URL
  if (isDataUrl && shouldNormalizeNextData) {
    currentUrl = normalizeNextDataUrl(currentUrl, basePath, buildId)
  }

  // Process afterFiles routes
  for (const route of routes.afterFiles) {
    const match = matchRoute(
      route,
      currentUrl,
      currentRequestHeaders,
      caseSensitive
    )

    if (match.matched) {
      if (match.headers) {
        for (const [key, value] of Object.entries(match.headers)) {
          currentResponseHeaders.set(key, value)
        }
      }

      if (route.status) {
        currentStatus = route.status
      }

      if (match.destination) {
        // Check if route has redirect status and Location/Refresh header
        if (
          isRedirectStatus(route.status) &&
          match.headers &&
          hasRedirectHeaders(match.headers)
        ) {
          const redirectUrl = isExternalDestination(match.destination)
            ? new URL(match.destination)
            : applyDestination(currentUrl, match.destination)

          return {
            redirect: {
              url: redirectUrl,
              status: route.status!,
            },
            resolvedHeaders: currentResponseHeaders,
            status: currentStatus,
          }
        }

        // Check if it's an external rewrite
        if (isExternalDestination(match.destination)) {
          return {
            externalRewrite: new URL(match.destination),
            resolvedHeaders: currentResponseHeaders,
            status: currentStatus,
          }
        }

        // Apply destination
        currentUrl = applyDestination(currentUrl, match.destination)

        // Check if origin changed
        if (currentUrl.origin !== initialOrigin) {
          return {
            externalRewrite: currentUrl,
            resolvedHeaders: currentResponseHeaders,
            status: currentStatus,
          }
        }

        // First check dynamic routes to extract route matches
        const dynamicResult = checkDynamicRoutes(
          routes.dynamicRoutes,
          currentUrl,
          pathnames,
          currentRequestHeaders,
          currentResponseHeaders,
          routes.onMatch,
          basePath,
          buildId,
          i18n,
          shouldNormalizeNextData,
          isDataUrl,
          caseSensitive
        )
        if (dynamicResult.matched && dynamicResult.result) {
          // Reset URL to the denormalized version if it matched
          if (dynamicResult.resetUrl) {
            currentUrl = dynamicResult.resetUrl
          }
          return { ...dynamicResult.result, status: currentStatus }
        }

        // If no dynamic route matched, check static pathname
        // Denormalize before checking if this was originally a data URL
        let pathnameCheckUrl = currentUrl
        if (isDataUrl && shouldNormalizeNextData) {
          pathnameCheckUrl = denormalizeNextDataUrl(
            currentUrl,
            basePath,
            buildId
          )
        }

        matchedPath = matchesPathname(pathnameCheckUrl.pathname, pathnames)
        if (matchedPath) {
          const finalHeaders = applyOnMatchHeaders(
            routes.onMatch,
            pathnameCheckUrl,
            currentRequestHeaders,
            currentResponseHeaders,
            caseSensitive
          )
          return withResolvedInvocationTarget({
            result: {
              resolvedHeaders: finalHeaders,
              status: currentStatus,
            },
            url: pathnameCheckUrl,
            resolvedPathname: matchedPath,
            invocationPathname: pathnameCheckUrl.pathname,
          })
        }
      }
    }
  }

  // Check dynamic routes
  for (const route of routes.dynamicRoutes) {
    const match = matchDynamicRoute(currentUrl.pathname, route, caseSensitive)

    if (match.matched) {
      // Check has/missing conditions
      const hasResult = checkHasConditions(
        route.has,
        currentUrl,
        currentRequestHeaders
      )
      const missingMatched = checkMissingConditions(
        route.missing,
        currentUrl,
        currentRequestHeaders
      )

      if (hasResult.matched && missingMatched) {
        const replacedDestination = route.destination
          ? replaceDestination(
              route.destination,
              match.regexMatches || null,
              hasResult.captures
            )
          : undefined
        // Check if the destination pathname (template path) is in the provided pathnames list
        // For dynamic routes, the destination contains the template path like /dynamic/[slug]
        const pathnameToCheck = replacedDestination
          ? replacedDestination.split('?')[0]
          : currentUrl.pathname
        matchedPath = matchesPathnameWithLocaleFallback({
          pathname: pathnameToCheck,
          pathnames,
          basePath,
          i18n,
        })
        if (matchedPath) {
          const resolvedUrl = replacedDestination
            ? mergeDestinationQueryIntoUrl(currentUrl, replacedDestination)
            : currentUrl
          const finalHeaders = applyOnMatchHeaders(
            routes.onMatch,
            resolvedUrl,
            currentRequestHeaders,
            currentResponseHeaders,
            caseSensitive
          )
          return withResolvedInvocationTarget({
            result: {
              routeMatches: match.params,
              resolvedHeaders: finalHeaders,
              status: currentStatus,
            },
            url: resolvedUrl,
            resolvedPathname: matchedPath,
            invocationPathname: currentUrl.pathname,
          })
        }
      }
    }
  }

  // Process fallback routes
  for (const route of routes.fallback) {
    const match = matchRoute(
      route,
      currentUrl,
      currentRequestHeaders,
      caseSensitive
    )

    if (match.matched) {
      if (match.headers) {
        for (const [key, value] of Object.entries(match.headers)) {
          currentResponseHeaders.set(key, value)
        }
      }

      if (route.status) {
        currentStatus = route.status
      }

      if (match.destination) {
        // Check if route has redirect status and Location/Refresh header
        if (
          isRedirectStatus(route.status) &&
          match.headers &&
          hasRedirectHeaders(match.headers)
        ) {
          const redirectUrl = isExternalDestination(match.destination)
            ? new URL(match.destination)
            : applyDestination(currentUrl, match.destination)

          return {
            redirect: {
              url: redirectUrl,
              status: route.status!,
            },
            resolvedHeaders: currentResponseHeaders,
            status: currentStatus,
          }
        }

        // Check if it's an external rewrite
        if (isExternalDestination(match.destination)) {
          return {
            externalRewrite: new URL(match.destination),
            resolvedHeaders: currentResponseHeaders,
            status: currentStatus,
          }
        }

        // Apply destination
        currentUrl = applyDestination(currentUrl, match.destination)

        // Check if origin changed
        if (currentUrl.origin !== initialOrigin) {
          return {
            externalRewrite: currentUrl,
            resolvedHeaders: currentResponseHeaders,
            status: currentStatus,
          }
        }

        // First check dynamic routes to extract route matches
        const dynamicResult = checkDynamicRoutes(
          routes.dynamicRoutes,
          currentUrl,
          pathnames,
          currentRequestHeaders,
          currentResponseHeaders,
          routes.onMatch,
          basePath,
          buildId,
          i18n,
          shouldNormalizeNextData,
          isDataUrl,
          caseSensitive
        )
        if (dynamicResult.matched && dynamicResult.result) {
          // Reset URL to the denormalized version if it matched
          if (dynamicResult.resetUrl) {
            currentUrl = dynamicResult.resetUrl
          }
          return { ...dynamicResult.result, status: currentStatus }
        }

        // If no dynamic route matched, check static pathname
        // Denormalize before checking if this was originally a data URL
        let pathnameCheckUrl = currentUrl
        if (isDataUrl && shouldNormalizeNextData) {
          pathnameCheckUrl = denormalizeNextDataUrl(
            currentUrl,
            basePath,
            buildId
          )
        }

        matchedPath = matchesPathname(pathnameCheckUrl.pathname, pathnames)
        if (matchedPath) {
          const finalHeaders = applyOnMatchHeaders(
            routes.onMatch,
            pathnameCheckUrl,
            currentRequestHeaders,
            currentResponseHeaders,
            caseSensitive
          )
          return withResolvedInvocationTarget({
            result: {
              resolvedHeaders: finalHeaders,
              status: currentStatus,
            },
            url: pathnameCheckUrl,
            resolvedPathname: matchedPath,
            invocationPathname: pathnameCheckUrl.pathname,
          })
        }
      }
    }
  }

  // No match found
  return {
    resolvedHeaders: currentResponseHeaders,
    status: currentStatus,
  }
}
