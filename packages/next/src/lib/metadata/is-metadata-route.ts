import type { PageExtensions } from '../../build/page-extensions-type'
import { normalizePathSep } from '../../shared/lib/page-path/normalize-path-sep'
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
// const defaultExtensions = ['js', 'jsx', 'ts', 'tsx']

// Match the file extension with the dynamic multi-routes extensions
// e.g. ([xml, js], null) -> can match `/sitemap.xml/route`, `sitemap.js/route`
// e.g. ([png], [ts]) -> can match `/opengrapg-image.png`, `/opengraph-image.ts`
export const getExtensionRegexString = (
  staticExtensions: readonly string[],
  dynamicExtensions: readonly string[] | null
) => {
  // If there's no possible multi dynamic routes, will not match any <name>[].<ext> files
  if (!dynamicExtensions || dynamicExtensions.length === 0) {
    return `\\.(?:${staticExtensions.join('|')})`
  }
  return `(?:\\.(${staticExtensions.join('|')})|((\\[\\])?\\.(${dynamicExtensions.join('|')})))`
}

// When you only pass the file extension as `[]`, it will only match the static convention files
// e.g. /robots.txt, /sitemap.xml, /favicon.ico, /manifest.json
// When you pass the file extension as `['js', 'jsx', 'ts', 'tsx']`, it will also match the dynamic convention files
// e.g. /robots.js, /sitemap.tsx, /favicon.jsx, /manifest.ts
// When `withExtension` is false, it will match the static convention files without the extension, by default it's true
// e.g. /robots, /sitemap, /favicon, /manifest, use to match dynamic API routes like app/robots.ts
export function isMetadataRouteFile(
  appDirRelativePath: string,
  pageExtensions: PageExtensions,
  strictlyMatchExtensions: boolean
) {
  const metadataRouteFilesRegex = [
    new RegExp(
      `^[\\\\/]robots${getExtensionRegexString(
        pageExtensions.concat('txt'),
        null
      )}
        ${strictlyMatchExtensions ? '' : '$'}`
    ),
    new RegExp(
      `^[\\\\/]manifest${getExtensionRegexString(
        pageExtensions.concat('webmanifest', 'json'),
        null
      )}
        ${strictlyMatchExtensions ? '' : '$'}`
    ),
    new RegExp(`^[\\\\/]favicon\\.ico$`),
    new RegExp(
      `[\\\\/]sitemap${getExtensionRegexString(['xml'], pageExtensions)}
        ${strictlyMatchExtensions ? '' : '$'}`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.icon.filename}\\d?${getExtensionRegexString(
        STATIC_METADATA_IMAGES.icon.extensions,
        pageExtensions
      )}
        ${strictlyMatchExtensions ? '' : '$'}`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.apple.filename}\\d?${getExtensionRegexString(
        STATIC_METADATA_IMAGES.apple.extensions,
        pageExtensions
      )}
        ${strictlyMatchExtensions ? '' : '$'}`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.openGraph.filename}\\d?${getExtensionRegexString(
        STATIC_METADATA_IMAGES.openGraph.extensions,
        pageExtensions
      )}
        ${strictlyMatchExtensions ? '' : '$'}`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.twitter.filename}\\d?${getExtensionRegexString(
        STATIC_METADATA_IMAGES.twitter.extensions,
        pageExtensions
      )}
        ${strictlyMatchExtensions ? '' : '$'}`
    ),
  ]

  const normalizedAppDirRelativePath = normalizePathSep(appDirRelativePath)
  return metadataRouteFilesRegex.some((r) =>
    r.test(normalizedAppDirRelativePath)
  )
}

export function isStaticMetadataRoutePage(appDirRelativePath: string) {
  return isMetadataRouteFile(appDirRelativePath, [], true)
}

// Check if the route is a static metadata route, with /route suffix
// e.g. /favicon.ico/route, /icon.png/route, etc.
// But skip the text routes like robots.txt since they might also be dynamic.
// Checking route path is not enough to determine if text routes is dynamic.
export function isStaticMetadataRoute(route: string) {
  const pathname = route.slice(0, -'/route'.length)
  return (
    isAppRouteRoute(route) &&
    isStaticMetadataRoutePage(pathname) &&
    // These routes can either be built by static or dynamic entrypoints,
    // so we assume they're dynamic
    pathname !== '/robots.txt' &&
    pathname !== '/manifest.webmanifest' &&
    !pathname.endsWith('/sitemap.xml')
  )
}

// The input is a page, which can be with or without page suffix /foo/page or /foo.
// But it will not contain the /route suffix.
export function isMetadataPage(pathname: string) {
  const res =
    !isAppRouteRoute(pathname) && isMetadataRouteFile(pathname, [], false)
  if (pathname.endsWith('.png')) {
    console.trace(
      'res',
      res,
      pathname,
      isMetadataRouteFile(pathname, [], false)
    )
  }
  return res
}

/*
 * Remove the 'app' prefix or '/route' suffix, only check the route name since they're only allowed in root app directory
 * e.g.
 * /app/robots/route -> /robots
 * app/robots/route -> /robots
 * /robots/route -> /robots
 */
export function isMetadataRoute(route: string): boolean {
  let page = route.replace(/^\/?app\//, '').slice(0, -'/route'.length)

  if (page[0] !== '/') page = '/' + page

  return isAppRouteRoute(route) && isMetadataRouteFile(page, [], true)
}
