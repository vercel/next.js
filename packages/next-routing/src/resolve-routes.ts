import type { Route, ResolveRoutesParams, ResolveRoutesResult } from './types'
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

/**
 * Attempts to match a route against the current URL and conditions
 */
function matchRoute(
  route: Route,
  url: URL,
  headers: Headers
): {
  matched: boolean
  destination?: string
  regexMatches?: RegExpMatchArray
  hasCaptures?: Record<string, string>
} {
  // Check if source regex matches the pathname
  const regex = new RegExp(route.sourceRegex)
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

  return {
    matched: true,
    destination,
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
  headers: Headers,
  initialOrigin: string
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
    const match = matchRoute(route, currentUrl, headers)

    if (match.matched) {
      if (route.headers) {
        for (const [key, value] of Object.entries(route.headers)) {
          headers.set(key, value)
        }
      }

      if (route.status) {
        currentStatus = route.status
      }

      if (match.destination) {
        // Check if route has redirect status and Location/Refresh header
        if (
          isRedirectStatus(route.status) &&
          route.headers &&
          hasRedirectHeaders(route.headers)
        ) {
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

/**
 * Matches dynamic routes and extracts route parameters
 */
function matchDynamicRoute(
  pathname: string,
  route: Route
): { matched: boolean; params?: Record<string, string> } {
  const regex = new RegExp(route.sourceRegex)
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

  return { matched: true, params }
}

/**
 * Applies headers from onMatch routes
 */
function applyOnMatchHeaders(routes: Route[], headers: Headers): Headers {
  const newHeaders = new Headers(headers)

  for (const route of routes) {
    if (route.headers) {
      for (const [key, value] of Object.entries(route.headers)) {
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
  headers: Headers,
  onMatchRoutes: Route[],
  basePath: string,
  buildId: string,
  shouldNormalizeNextData?: boolean,
  isDataUrl?: boolean
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
    const match = matchDynamicRoute(checkUrl.pathname, route)

    if (match.matched) {
      // Check has/missing conditions
      const hasResult = checkHasConditions(route.has, checkUrl, headers)
      const missingMatched = checkMissingConditions(
        route.missing,
        checkUrl,
        headers
      )

      if (hasResult.matched && missingMatched) {
        // Check if the current pathname is in the provided pathnames list
        const matchedPath = matchesPathname(checkUrl.pathname, pathnames)
        if (matchedPath) {
          const finalHeaders = applyOnMatchHeaders(onMatchRoutes, headers)
          return {
            matched: true,
            result: {
              matchedPathname: matchedPath,
              routeMatches: match.params,
              resolvedHeaders: finalHeaders,
            },
            resetUrl: checkUrl, // Return the denormalized URL to reset to
          }
        }
      }
    }
  }

  return { matched: false }
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

  const { shouldNormalizeNextData } = routes

  let currentUrl = new URL(initialUrl.toString())
  let currentHeaders = new Headers(initialHeaders)
  let currentStatus: number | undefined
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

    // Skip locale handling for _next routes
    if (!pathname.startsWith('/_next/')) {
      const hostname = currentUrl.hostname
      const cookieHeader = currentHeaders.get('cookie') || undefined
      const acceptLanguageHeader =
        currentHeaders.get('accept-language') || undefined

      // Detect locale from path first
      const pathLocaleResult = normalizeLocalePath(pathname, i18n.locales)
      const localeInPath = !!pathLocaleResult.detectedLocale

      // Detect domain locale
      const domainLocale = detectDomainLocale(i18n.domains, hostname)
      const defaultLocale = domainLocale?.defaultLocale || i18n.defaultLocale

      // Determine target locale if locale detection is enabled
      let targetLocale = pathLocaleResult.detectedLocale || defaultLocale

      if (i18n.localeDetection !== false && !localeInPath) {
        // Full locale detection when no locale in path
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

            return {
              redirect: {
                url: redirectUrl,
                status: 307,
              },
              resolvedHeaders: currentHeaders,
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

            return {
              redirect: {
                url: redirectUrl,
                status: 307,
              },
              resolvedHeaders: currentHeaders,
            }
          }
        }
      }

      // Prefix the locale internally for route resolution (without redirecting)
      if (!localeInPath) {
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
    currentHeaders,
    initialOrigin
  )

  if (beforeMiddlewareResult.status) {
    currentStatus = beforeMiddlewareResult.status
  }

  if (beforeMiddlewareResult.redirect) {
    return {
      redirect: beforeMiddlewareResult.redirect,
      resolvedHeaders: currentHeaders,
      status: currentStatus,
    }
  }

  if (beforeMiddlewareResult.externalRewrite) {
    return {
      externalRewrite: beforeMiddlewareResult.externalRewrite,
      resolvedHeaders: currentHeaders,
      status: currentStatus,
    }
  }

  currentUrl = beforeMiddlewareResult.url

  // Denormalize before invoking middleware if this was originally a data URL
  if (isDataUrl && shouldNormalizeNextData) {
    currentUrl = denormalizeNextDataUrl(currentUrl, basePath, buildId)
  }

  // Invoke middleware
  const middlewareResult = await invokeMiddleware({
    url: currentUrl,
    headers: currentHeaders,
    requestBody,
  })

  // Check if middleware sent the response body
  if (middlewareResult.bodySent) {
    return { middlewareResponded: true }
  }

  // Apply request headers from middleware
  if (middlewareResult.requestHeaders) {
    currentHeaders = new Headers(middlewareResult.requestHeaders)
  }

  // Handle middleware redirect
  if (middlewareResult.redirect) {
    currentHeaders.set('Location', middlewareResult.redirect.url.toString())
    return {
      resolvedHeaders: currentHeaders,
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
        resolvedHeaders: currentHeaders,
        status: currentStatus,
      }
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
    currentHeaders,
    initialOrigin
  )

  if (beforeFilesResult.status) {
    currentStatus = beforeFilesResult.status
  }

  if (beforeFilesResult.redirect) {
    return {
      redirect: beforeFilesResult.redirect,
      resolvedHeaders: currentHeaders,
      status: currentStatus,
    }
  }

  if (beforeFilesResult.externalRewrite) {
    return {
      externalRewrite: beforeFilesResult.externalRewrite,
      resolvedHeaders: currentHeaders,
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
    // Check if any dynamic route also matches to extract parameters
    for (const route of routes.dynamicRoutes) {
      const match = matchDynamicRoute(currentUrl.pathname, route)

      if (match.matched) {
        // Check has/missing conditions
        const hasResult = checkHasConditions(
          route.has,
          currentUrl,
          currentHeaders
        )
        const missingMatched = checkMissingConditions(
          route.missing,
          currentUrl,
          currentHeaders
        )

        if (hasResult.matched && missingMatched) {
          const finalHeaders = applyOnMatchHeaders(
            routes.onMatch,
            currentHeaders
          )
          return {
            matchedPathname: matchedPath,
            routeMatches: match.params,
            resolvedHeaders: finalHeaders,
            status: currentStatus,
          }
        }
      }
    }

    // No dynamic route matched, return without route matches
    const finalHeaders = applyOnMatchHeaders(routes.onMatch, currentHeaders)
    return {
      matchedPathname: matchedPath,
      resolvedHeaders: finalHeaders,
      status: currentStatus,
    }
  }

  // Normalize again before processing afterFiles if this was originally a data URL
  if (isDataUrl && shouldNormalizeNextData) {
    currentUrl = normalizeNextDataUrl(currentUrl, basePath, buildId)
  }

  // Process afterFiles routes
  for (const route of routes.afterFiles) {
    const match = matchRoute(route, currentUrl, currentHeaders)

    if (match.matched) {
      if (route.headers) {
        for (const [key, value] of Object.entries(route.headers)) {
          currentHeaders.set(key, value)
        }
      }

      if (route.status) {
        currentStatus = route.status
      }

      if (match.destination) {
        // Check if route has redirect status and Location/Refresh header
        if (
          isRedirectStatus(route.status) &&
          route.headers &&
          hasRedirectHeaders(route.headers)
        ) {
          const redirectUrl = isExternalDestination(match.destination)
            ? new URL(match.destination)
            : applyDestination(currentUrl, match.destination)

          return {
            redirect: {
              url: redirectUrl,
              status: route.status!,
            },
            resolvedHeaders: currentHeaders,
            status: currentStatus,
          }
        }

        // Check if it's an external rewrite
        if (isExternalDestination(match.destination)) {
          return {
            externalRewrite: new URL(match.destination),
            resolvedHeaders: currentHeaders,
            status: currentStatus,
          }
        }

        // Apply destination
        currentUrl = applyDestination(currentUrl, match.destination)

        // Check if origin changed
        if (currentUrl.origin !== initialOrigin) {
          return {
            externalRewrite: currentUrl,
            resolvedHeaders: currentHeaders,
            status: currentStatus,
          }
        }

        // First check dynamic routes to extract route matches
        const dynamicResult = checkDynamicRoutes(
          routes.dynamicRoutes,
          currentUrl,
          pathnames,
          currentHeaders,
          routes.onMatch,
          basePath,
          buildId,
          shouldNormalizeNextData,
          isDataUrl
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
            currentHeaders
          )
          return {
            matchedPathname: matchedPath,
            resolvedHeaders: finalHeaders,
            status: currentStatus,
          }
        }
      }
    }
  }

  // Check dynamic routes
  for (const route of routes.dynamicRoutes) {
    const match = matchDynamicRoute(currentUrl.pathname, route)

    if (match.matched) {
      // Check has/missing conditions
      const hasResult = checkHasConditions(
        route.has,
        currentUrl,
        currentHeaders
      )
      const missingMatched = checkMissingConditions(
        route.missing,
        currentUrl,
        currentHeaders
      )

      if (hasResult.matched && missingMatched) {
        // Check if the current pathname is in the provided pathnames list
        matchedPath = matchesPathname(currentUrl.pathname, pathnames)
        if (matchedPath) {
          const finalHeaders = applyOnMatchHeaders(
            routes.onMatch,
            currentHeaders
          )
          return {
            matchedPathname: matchedPath,
            routeMatches: match.params,
            resolvedHeaders: finalHeaders,
            status: currentStatus,
          }
        }
      }
    }
  }

  // Process fallback routes
  for (const route of routes.fallback) {
    const match = matchRoute(route, currentUrl, currentHeaders)

    if (match.matched) {
      if (route.headers) {
        for (const [key, value] of Object.entries(route.headers)) {
          currentHeaders.set(key, value)
        }
      }

      if (route.status) {
        currentStatus = route.status
      }

      if (match.destination) {
        // Check if route has redirect status and Location/Refresh header
        if (
          isRedirectStatus(route.status) &&
          route.headers &&
          hasRedirectHeaders(route.headers)
        ) {
          const redirectUrl = isExternalDestination(match.destination)
            ? new URL(match.destination)
            : applyDestination(currentUrl, match.destination)

          return {
            redirect: {
              url: redirectUrl,
              status: route.status!,
            },
            resolvedHeaders: currentHeaders,
            status: currentStatus,
          }
        }

        // Check if it's an external rewrite
        if (isExternalDestination(match.destination)) {
          return {
            externalRewrite: new URL(match.destination),
            resolvedHeaders: currentHeaders,
            status: currentStatus,
          }
        }

        // Apply destination
        currentUrl = applyDestination(currentUrl, match.destination)

        // Check if origin changed
        if (currentUrl.origin !== initialOrigin) {
          return {
            externalRewrite: currentUrl,
            resolvedHeaders: currentHeaders,
            status: currentStatus,
          }
        }

        // First check dynamic routes to extract route matches
        const dynamicResult = checkDynamicRoutes(
          routes.dynamicRoutes,
          currentUrl,
          pathnames,
          currentHeaders,
          routes.onMatch,
          basePath,
          buildId,
          shouldNormalizeNextData,
          isDataUrl
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
            currentHeaders
          )
          return {
            matchedPathname: matchedPath,
            resolvedHeaders: finalHeaders,
            status: currentStatus,
          }
        }
      }
    }
  }

  // No match found
  return {
    resolvedHeaders: currentHeaders,
    status: currentStatus,
  }
}
