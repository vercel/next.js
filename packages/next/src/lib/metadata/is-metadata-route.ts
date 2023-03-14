import path from 'path'

const regexMetadataRoutes = [
  /^robots(\.txt)?/,
  /^sitemap(\.xml)?/,
  /^favicon(\.ico)?/,
]
const staticRegexMetadataRoutes = [
  /^robots\.txt/,
  /^sitemap\.xml/,
  /^favicon\.ico/,
]

// Match routes that are metadata routes, e.g. /sitemap.xml, /favicon.<ext>, /<icon>.<ext>, etc.
// TODO-METADATA: support more metadata routes with more extensions
export function isMetadataRoute(route: string): boolean {
  // Remove the 'app/' or '/' prefix, only check the route name since they're only allowed in root app directory
  const baseName = route
    .replace(/^app\//, '')
    .replace(/^\//, '')
    .replace(/\/route$/, '')

  return (
    !baseName.endsWith('/page') &&
    regexMetadataRoutes.some((r) => r.test(baseName))
  )
}

// Only match the static metadata files
// TODO-METADATA: support static metadata files under nested routes folders
export function isStaticMetadataRoute(resourcePath: string) {
  const filename = path.basename(resourcePath)
  return staticRegexMetadataRoutes.some((r) => r.test(filename))
}
