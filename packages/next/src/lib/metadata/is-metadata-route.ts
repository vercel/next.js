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

const getExtensionRegexString = (extensions: readonly string[]) =>
  `(?:${extensions.join('|')})`

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
          ? `\\.${getExtensionRegexString(pageExtensions.concat('txt'))}$`
          : ''
      }`
    ),
    new RegExp(
      `^[\\\\/]manifest${
        withExtension
          ? `\\.${getExtensionRegexString(
              pageExtensions.concat('webmanifest', 'json')
            )}$`
          : ''
      }`
    ),
    new RegExp(`^[\\\\/]favicon\\.ico$`),
    new RegExp(
      `[\\\\/]sitemap${
        withExtension
          ? `\\.${getExtensionRegexString(pageExtensions.concat('xml'))}$`
          : ''
      }`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.icon.filename}\\d?${
        withExtension
          ? `\\.${getExtensionRegexString(
              pageExtensions.concat(STATIC_METADATA_IMAGES.icon.extensions)
            )}$`
          : ''
      }`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.apple.filename}\\d?${
        withExtension
          ? `\\.${getExtensionRegexString(
              pageExtensions.concat(STATIC_METADATA_IMAGES.apple.extensions)
            )}$`
          : ''
      }`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.openGraph.filename}\\d?${
        withExtension
          ? `\\.${getExtensionRegexString(
              pageExtensions.concat(STATIC_METADATA_IMAGES.openGraph.extensions)
            )}$`
          : ''
      }`
    ),
    new RegExp(
      `[\\\\/]${STATIC_METADATA_IMAGES.twitter.filename}\\d?${
        withExtension
          ? `\\.${getExtensionRegexString(
              pageExtensions.concat(STATIC_METADATA_IMAGES.twitter.extensions)
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
