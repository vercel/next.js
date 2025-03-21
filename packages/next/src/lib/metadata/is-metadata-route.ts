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
// e.g. ([png], [ts]) -> can match `/opengrapg-image.png`, `/opengraph-image.ts`
export const getExtensionRegexString = (
  staticExtensions: readonly string[],
  dynamicExtensions: readonly string[] | null
) => {
  // If there's no possible multi dynamic routes, will not match any <name>[].<ext> files
  if (!dynamicExtensions || dynamicExtensions.length === 0) {
    return `(\\.(?:${staticExtensions.join('|')}))`
  }
  return `(?:\\.(${staticExtensions.join('|')})|(\\.(${dynamicExtensions.join('|')})))`
}

/**
 * Determine if the file is a metadata route file entry
 * @param appDirRelativePath the relative file path to app/
 * @param pageExtensions the js extensions, such as ['js', 'jsx', 'ts', 'tsx']
 * @param strictlyMatchExtensions if it's true, match the file with page extension, otherwise match the file with default corresponding extension
 * @returns {boolean} if the file is a metadata route file
 */
export function isMetadataRouteFile(
  appDirRelativePath: string,
  pageExtensions: PageExtensions,
  strictlyMatchExtensions: boolean
) {
  // End with the extension or optional to have the extension
  // When strictlyMatchExtensions is true, it's used for match file path;
  // When strictlyMatchExtensions, the dynamic extension is skipped but
  // static extension is kept, which is usually used for matching route path.
  const trailingMatcher = (strictlyMatchExtensions ? '' : '?') + '$'
  // Match the optional variants like /opengraph-image2, /icon-a102f4.png, etc.
  const variantsMatcher = '\\d?'
  // The -\w{6} is the suffix that normalized from group routes;
  const groupSuffix = strictlyMatchExtensions ? '' : '(-\\w{6})?'

  const suffixMatcher = `${variantsMatcher}${groupSuffix}`

  const metadataRouteFilesRegex = [
    new RegExp(
      `^[\\\\/]robots${getExtensionRegexString(
        pageExtensions.concat('txt'),
        null
      )}${trailingMatcher}`
    ),
    new RegExp(
      `^[\\\\/]manifest${getExtensionRegexString(
        pageExtensions.concat('webmanifest', 'json'),
        null
      )}${trailingMatcher}`
    ),
    new RegExp(`^[\\\\/]favicon\\.ico$`),
    new RegExp(
      `[\\\\/]sitemap${getExtensionRegexString(['xml'], pageExtensions)}${trailingMatcher}`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.icon.filename}${suffixMatcher}${getExtensionRegexString(
        STATIC_METADATA_IMAGES.icon.extensions,
        pageExtensions
      )}${trailingMatcher}`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.apple.filename}${suffixMatcher}${getExtensionRegexString(
        STATIC_METADATA_IMAGES.apple.extensions,
        pageExtensions
      )}${trailingMatcher}`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.openGraph.filename}${suffixMatcher}${getExtensionRegexString(
        STATIC_METADATA_IMAGES.openGraph.extensions,
        pageExtensions
      )}${trailingMatcher}`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.twitter.filename}${suffixMatcher}${getExtensionRegexString(
        STATIC_METADATA_IMAGES.twitter.extensions,
        pageExtensions
      )}${trailingMatcher}`
    ),
  ]

  const normalizedAppDirRelativePath = normalizePathSep(appDirRelativePath)
  const matched = metadataRouteFilesRegex.some((r) =>
    r.test(normalizedAppDirRelativePath)
  )

  return matched
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
