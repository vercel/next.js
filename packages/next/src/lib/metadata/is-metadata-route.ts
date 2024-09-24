import type { PageExtensions } from '../../build/page-extensions-type'
import { normalizePathSep } from '../../shared/lib/page-path/normalize-path-sep'

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
const defaultExtensions = ['js', 'jsx', 'ts', 'tsx']

// Match the file extension with the dynamic multi-routes extensions
// e.g. ([xml, js], null) -> can match `/sitemap.xml/route`, `sitemap.js/route`
// e.g. ([png], [ts]) -> can match `/opengrapg-image.png/route`, `/opengraph-image.ts[]/route`
export const getExtensionRegexString = (
  staticExtensions: readonly string[],
  dynamicExtensions: readonly string[] | null
) => {
  // If there's no possible multi dynamic routes, will not match any <name>[].<ext> files
  if (!dynamicExtensions) {
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
  withExtension: boolean
) {
  const metadataRouteFilesRegex = [
    new RegExp(
      `^[\\\\/]robots${
        withExtension
          ? `${getExtensionRegexString(pageExtensions.concat('txt'), null)}$`
          : ''
      }`
    ),
    new RegExp(
      `^[\\\\/]manifest${
        withExtension
          ? `${getExtensionRegexString(
              pageExtensions.concat('webmanifest', 'json'),
              null
            )}$`
          : ''
      }`
    ),
    new RegExp(`^[\\\\/]favicon\\.ico$`),
    new RegExp(
      `[\\\\/]sitemap${
        withExtension
          ? `${getExtensionRegexString(['xml'], pageExtensions)}$`
          : ''
      }`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.icon.filename}\\d?${
        withExtension
          ? `${getExtensionRegexString(
              STATIC_METADATA_IMAGES.icon.extensions,
              pageExtensions
            )}$`
          : ''
      }`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.apple.filename}\\d?${
        withExtension
          ? `${getExtensionRegexString(
              STATIC_METADATA_IMAGES.apple.extensions,
              pageExtensions
            )}$`
          : ''
      }`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.openGraph.filename}\\d?${
        withExtension
          ? `${getExtensionRegexString(
              STATIC_METADATA_IMAGES.openGraph.extensions,
              pageExtensions
            )}$`
          : ''
      }`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.twitter.filename}\\d?${
        withExtension
          ? `${getExtensionRegexString(
              STATIC_METADATA_IMAGES.twitter.extensions,
              pageExtensions
            )}$`
          : ''
      }`
    ),
  ]

  const normalizedAppDirRelativePath = normalizePathSep(appDirRelativePath)
  return metadataRouteFilesRegex.some((r) =>
    r.test(normalizedAppDirRelativePath)
  )
}

export function isStaticMetadataRouteFile(appDirRelativePath: string) {
  return isMetadataRouteFile(appDirRelativePath, [], true)
}

export function isStaticMetadataRoute(page: string) {
  return (
    page === '/robots' ||
    page === '/manifest' ||
    isStaticMetadataRouteFile(page)
  )
}

/*
 * Remove the 'app' prefix or '/route' suffix, only check the route name since they're only allowed in root app directory
 * e.g.
 * /app/robots -> /robots
 * app/robots -> /robots
 * /robots -> /robots
 */
export function isMetadataRoute(route: string): boolean {
  let page = route.replace(/^\/?app\//, '').replace(/\/route$/, '')
  if (page[0] !== '/') page = '/' + page

  return (
    !page.endsWith('/page') &&
    isMetadataRouteFile(page, defaultExtensions, false)
  )
}
