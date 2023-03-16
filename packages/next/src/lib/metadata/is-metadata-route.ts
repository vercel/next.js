import { STATIC_METADATA_IMAGES } from '../../build/webpack/loaders/metadata/discover'

// Match routes that are metadata routes, e.g. /sitemap.xml, /favicon.<ext>, /<icon>.<ext>, etc.
// TODO-METADATA: support more metadata routes with more extensions
const defaultExtensions = ['js', 'jsx', 'ts', 'tsx']
export function isMetadataRoute(route: string): boolean {
  // Remove the 'app' prefix or '/route' suffix, only check the route name since they're only allowed in root app directory
  const page = route.replace(/^app/, '').replace(/\/route$/, '')

  return !page.endsWith('/page') && isMetadataRouteFile(page, defaultExtensions)
}

const getExtensionRegexString = (extensions: string[]) =>
  `(?:${extensions.join('|')})`

// When you only pass the file extension as `[]`, it will only match the static convention files
// e.g. /robots.txt, /sitemap.xml, /favicon.ico
// When you pass the file extension as `['js', 'jsx', 'ts', 'tsx']`, it will also match the dynamic convention files
// e.g. /robots.js, /sitemap.tsx, /favicon.jsx
export function isMetadataRouteFile(route: string, pageExtensions: string[]) {
  const metadataRoutesRelativePathRegex = [
    new RegExp(
      `^[\\\\/]robots\\.${getExtensionRegexString(
        pageExtensions.concat('txt')
      )}`
    ),
    new RegExp(
      `^[\\\\/]sitemap\\.${getExtensionRegexString(
        pageExtensions.concat('xml')
      )}`
    ),
    new RegExp(`^[\\\\/]favicon\\.ico$`),
    // TODO-METADATA: add dynamic routes for metadata images
    new RegExp(
      `[\\\\/]${
        STATIC_METADATA_IMAGES.icon.filename
      }\\.${getExtensionRegexString(STATIC_METADATA_IMAGES.icon.extensions)}`
    ),
    new RegExp(
      `[\\\\/]${
        STATIC_METADATA_IMAGES.apple.filename
      }\\.${getExtensionRegexString(STATIC_METADATA_IMAGES.apple.extensions)}`
    ),
    new RegExp(
      `[\\\\/]${
        STATIC_METADATA_IMAGES.opengraph.filename
      }\\.${getExtensionRegexString(
        STATIC_METADATA_IMAGES.opengraph.extensions
      )}`
    ),
    new RegExp(
      `[\\\\/]${
        STATIC_METADATA_IMAGES.twitter.filename
      }\\.${getExtensionRegexString(STATIC_METADATA_IMAGES.twitter.extensions)}`
    ),
  ]

  return metadataRoutesRelativePathRegex.some((r) => r.test(route))
}
