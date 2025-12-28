/**
 * Normalizes Next.js data URL by removing /_next/data/{buildId}/ prefix and .json extension
 * ${basePath}/_next/data/$buildId/$path.json -> ${basePath}/$path
 */
export function normalizeNextDataUrl(
  url: URL,
  basePath: string,
  buildId: string
): URL {
  const newUrl = new URL(url.toString())
  let pathname = newUrl.pathname

  // Pattern: ${basePath}/_next/data/${buildId}/${path}.json
  const dataPrefix = `${basePath}/_next/data/${buildId}/`

  if (pathname.startsWith(dataPrefix)) {
    // Remove the /_next/data/${buildId}/ part, keeping what comes after
    let pathAfterData = pathname.slice(dataPrefix.length)

    // Remove .json extension if present
    if (pathAfterData.endsWith('.json')) {
      pathAfterData = pathAfterData.slice(0, -5)
    }

    pathname = basePath ? `${basePath}/${pathAfterData}` : `/${pathAfterData}`
    newUrl.pathname = pathname
  }

  return newUrl
}

/**
 * Denormalizes URL by adding /_next/data/{buildId}/ prefix and .json extension
 * ${basePath}/$path -> ${basePath}/_next/data/$buildId/$path.json
 */
export function denormalizeNextDataUrl(
  url: URL,
  basePath: string,
  buildId: string
): URL {
  const newUrl = new URL(url.toString())
  let pathname = newUrl.pathname

  // Only denormalize if it's not already a data URL
  const dataPrefix = `${basePath}/_next/data/${buildId}/`
  if (!pathname.startsWith(dataPrefix)) {
    // Remove basePath if present
    let pathWithoutBase = pathname
    if (basePath && pathname.startsWith(basePath)) {
      pathWithoutBase = pathname.slice(basePath.length)
    }

    // Add the /_next/data/${buildId}/ prefix and .json extension
    pathname = `${basePath}/_next/data/${buildId}${pathWithoutBase}.json`
    newUrl.pathname = pathname
  }

  return newUrl
}
