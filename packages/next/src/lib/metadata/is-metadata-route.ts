import type { PageExtensions } from '../../build/page-extensions-type'
import { normalizePathSep } from '../../shared/lib/page-path/normalize-path-sep'
import { normalizeAppPath } from '../../shared/lib/router/utils/app-paths'
import { isAppRouteRoute } from '../is-app-route-route'

export const STATIC_METADATA_IMAGES = {
  icon: {
    filename: 'icon',
    extensions: ['ico', 'jpg', 'jpeg', 'png', 'svg'],
  },
  apple: {
    filename: 'apple-icon',
    extensions: ['jpg', 'jpeg', 'png'],
  },
  favicon: {
    filename: 'favicon',
    extensions: ['ico'],
  },
  openGraph: {
    filename: 'opengraph-image',
    extensions: ['jpg', 'jpeg', 'png', 'gif'],
  },
  twitter: {
    filename: 'twitter-image',
    extensions: ['jpg', 'jpeg', 'png', 'gif'],
  },
} as const

// Match routes that are metadata routes, e.g. /sitemap.xml, /favicon.<ext>, /<icon>.<ext>, etc.
// TODO-METADATA: support more metadata routes with more extensions
export const DEFAULT_METADATA_ROUTE_EXTENSIONS = ['js', 'jsx', 'ts', 'tsx']

// Match the file extension with the dynamic multi-routes extensions
// e.g. ([xml, js], null) -> can match `/sitemap.xml/route`, `sitemap.js/route`
// e.g. ([png], [ts]) -> can match `/opengraph-image.png`, `/opengraph-image.ts`
export const getExtensionRegexString = (
  staticExtensions: readonly string[],
  dynamicExtensions: readonly string[] | null
) => {
  let result: string
  // If there's no possible multi dynamic routes, will not match any <name>[].<ext> files
  if (!dynamicExtensions || dynamicExtensions.length === 0) {
    result = `(\\.(?:${staticExtensions.join('|')}))`
  } else {
    result = `(?:\\.(${staticExtensions.join('|')})|(\\.(${dynamicExtensions.join('|')})))`
  }
  return result
}

/**
 * Matches the static metadata files, e.g. /robots.txt, /sitemap.xml, /favicon.ico, etc.
 * @param appDirRelativePath the relative file path to app/
 * @returns if the path is a static metadata file route
 */
export function isStaticMetadataFile(appDirRelativePath: string) {
  return isMetadataRouteFile(appDirRelativePath, [], true)
}

// Pre-compiled static regexes for common cases
const FAVICON_REGEX = /^[\\/]favicon\.ico$/
const ROBOTS_TXT_REGEX = /^[\\/]robots\.txt$/
const MANIFEST_JSON_REGEX = /^[\\/]manifest\.json$/
const MANIFEST_WEBMANIFEST_REGEX = /^[\\/]manifest\.webmanifest$/
const SITEMAP_XML_REGEX = /[\\/]sitemap\.xml$/

// Cache for compiled regex patterns based on parameters
const compiledRegexCache = new Map<string, RegExp[]>()

// Fast path checks for common metadata files
function fastPathCheck(normalizedPath: string): boolean | null {
  // Check favicon.ico first (most common)
  if (FAVICON_REGEX.test(normalizedPath)) return true

  // Check other common static files
  if (ROBOTS_TXT_REGEX.test(normalizedPath)) return true
  if (MANIFEST_JSON_REGEX.test(normalizedPath)) return true
  if (MANIFEST_WEBMANIFEST_REGEX.test(normalizedPath)) return true
  if (SITEMAP_XML_REGEX.test(normalizedPath)) return true

  // Quick negative check - if it doesn't contain any metadata keywords, skip
  if (
    !normalizedPath.includes('robots') &&
    !normalizedPath.includes('manifest') &&
    !normalizedPath.includes('sitemap') &&
    !normalizedPath.includes('icon') &&
    !normalizedPath.includes('apple-icon') &&
    !normalizedPath.includes('opengraph-image') &&
    !normalizedPath.includes('twitter-image') &&
    !normalizedPath.includes('favicon')
  ) {
    return false
  }

  return null // Continue with full regex matching
}

function getCompiledRegexes(
  pageExtensions: PageExtensions,
  strictlyMatchExtensions: boolean
): RegExp[] {
  // Create cache key
  const cacheKey = `${pageExtensions.join(',')}|${strictlyMatchExtensions}`

  const cached = compiledRegexCache.get(cacheKey)
  if (cached) {
    return cached
  }

  // Pre-compute common strings
  const trailingMatcher = strictlyMatchExtensions ? '$' : '?$'
  const variantsMatcher = '\\d?'
  const groupSuffix = strictlyMatchExtensions ? '' : '(-\\w{6})?'
  const suffixMatcher = variantsMatcher + groupSuffix

  // Pre-compute extension arrays to avoid repeated concatenation
  const robotsExts =
    pageExtensions.length > 0 ? [...pageExtensions, 'txt'] : ['txt']
  const manifestExts =
    pageExtensions.length > 0
      ? [...pageExtensions, 'webmanifest', 'json']
      : ['webmanifest', 'json']

  const regexes = [
    new RegExp(
      `^[\\\\/]robots${getExtensionRegexString(robotsExts, null)}${trailingMatcher}`
    ),
    new RegExp(
      `^[\\\\/]manifest${getExtensionRegexString(manifestExts, null)}${trailingMatcher}`
    ),
    // FAVICON_REGEX removed - already handled in fastPathCheck
    new RegExp(
      `[\\\\/]sitemap${getExtensionRegexString(['xml'], pageExtensions)}${trailingMatcher}`
    ),
    new RegExp(
      `[\\\\/]icon${suffixMatcher}${getExtensionRegexString(
        STATIC_METADATA_IMAGES.icon.extensions,
        pageExtensions
      )}${trailingMatcher}`
    ),
    new RegExp(
      `[\\\\/]apple-icon${suffixMatcher}${getExtensionRegexString(
        STATIC_METADATA_IMAGES.apple.extensions,
        pageExtensions
      )}${trailingMatcher}`
    ),
    new RegExp(
      `[\\\\/]opengraph-image${suffixMatcher}${getExtensionRegexString(
        STATIC_METADATA_IMAGES.openGraph.extensions,
        pageExtensions
      )}${trailingMatcher}`
    ),
    new RegExp(
      `[\\\\/]twitter-image${suffixMatcher}${getExtensionRegexString(
        STATIC_METADATA_IMAGES.twitter.extensions,
        pageExtensions
      )}${trailingMatcher}`
    ),
  ]

  compiledRegexCache.set(cacheKey, regexes)
  return regexes
}

/**
 * Determine if the file is a metadata route file entry
 * @param appDirRelativePath the relative file path to app/
 * @param pageExtensions the js extensions, such as ['js', 'jsx', 'ts', 'tsx']
 * @param strictlyMatchExtensions if it's true, match the file with page extension, otherwise match the file with default corresponding extension
 * @returns if the file is a metadata route file
 */
export function isMetadataRouteFile(
  appDirRelativePath: string,
  pageExtensions: PageExtensions,
  strictlyMatchExtensions: boolean
): boolean {
  // Early exit for empty or obviously non-metadata paths
  if (!appDirRelativePath || appDirRelativePath.length < 2) {
    return false
  }

  const normalizedPath = normalizePathSep(appDirRelativePath)

  // Fast path check for common cases
  const fastResult = fastPathCheck(normalizedPath)
  if (fastResult !== null) {
    return fastResult
  }

  // Get compiled regexes from cache
  const regexes = getCompiledRegexes(pageExtensions, strictlyMatchExtensions)

  // Use for loop instead of .some() for better performance
  for (let i = 0; i < regexes.length; i++) {
    if (regexes[i].test(normalizedPath)) {
      return true
    }
  }

  return false
}

// Check if the route is a static metadata route, with /route suffix
// e.g. /favicon.ico/route, /icon.png/route, etc.
// But skip the text routes like robots.txt since they might also be dynamic.
// Checking route path is not enough to determine if text routes is dynamic.
export function isStaticMetadataRoute(route: string) {
  // extract ext with regex
  const pathname = route.replace(/\/route$/, '')

  const matched =
    isAppRouteRoute(route) &&
    isMetadataRouteFile(pathname, [], true) &&
    // These routes can either be built by static or dynamic entrypoints,
    // so we assume they're dynamic
    pathname !== '/robots.txt' &&
    pathname !== '/manifest.webmanifest' &&
    !pathname.endsWith('/sitemap.xml')

  return matched
}

/**
 * Determine if a page or pathname is a metadata page.
 *
 * The input is a page or pathname, which can be with or without page suffix /foo/page or /foo.
 * But it will not contain the /route suffix.
 *
 * .e.g
 * /robots -> true
 * /sitemap -> true
 * /foo -> false
 */
export function isMetadataPage(page: string) {
  const matched = !isAppRouteRoute(page) && isMetadataRouteFile(page, [], false)

  return matched
}

/*
 * Determine if a Next.js route is a metadata route.
 * `route` will has a route suffix.
 *
 * e.g.
 * /app/robots/route -> true
 * /robots/route -> true
 * /sitemap/[__metadata_id__]/route -> true
 * /app/sitemap/page -> false
 * /icon-a102f4/route -> true
 */
export function isMetadataRoute(route: string): boolean {
  let page = normalizeAppPath(route)
    .replace(/^\/?app\//, '')
    // Remove the dynamic route id
    .replace('/[__metadata_id__]', '')
    // Remove the /route suffix
    .replace(/\/route$/, '')

  if (page[0] !== '/') page = '/' + page

  const matched = isAppRouteRoute(route) && isMetadataRouteFile(page, [], false)

  return matched
}
