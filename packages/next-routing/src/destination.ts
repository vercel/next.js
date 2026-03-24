/**
 * Replaces $1, $2, etc. and $name placeholders in the destination string
 * with matches from the regex and has conditions
 */
export function replaceDestination(
  destination: string,
  regexMatches: RegExpMatchArray | null,
  hasCaptures: Record<string, string>
): string {
  let result = destination

  // Replace numbered captures from regex ($1, $2, etc.)
  if (regexMatches) {
    // Replace numbered groups (skip index 0 which is the full match)
    for (let i = 1; i < regexMatches.length; i++) {
      const value = regexMatches[i]
      if (value !== undefined) {
        result = result.replace(new RegExp(`\\$${i}`, 'g'), value)
      }
    }

    // Replace named groups ($name)
    if (regexMatches.groups) {
      for (const [name, value] of Object.entries(regexMatches.groups)) {
        if (value !== undefined) {
          result = result.replace(new RegExp(`\\$${name}`, 'g'), value)
        }
      }
    }
  }

  // Replace named captures from has conditions
  for (const [name, value] of Object.entries(hasCaptures)) {
    result = result.replace(new RegExp(`\\$${name}`, 'g'), value)
  }

  return result
}

/**
 * Checks if a destination is an external rewrite (starts with http/https)
 */
export function isExternalDestination(destination: string): boolean {
  return destination.startsWith('http://') || destination.startsWith('https://')
}

/**
 * Applies a destination to a URL, updating the pathname or creating a new URL
 * if it's external
 */
export function applyDestination(currentUrl: URL, destination: string): URL {
  if (isExternalDestination(destination)) {
    return new URL(destination)
  }

  // Create a new URL with the updated pathname
  const newUrl = new URL(currentUrl.toString())

  // Handle destinations with query strings
  const [pathname, search] = destination.split('?')
  newUrl.pathname = pathname

  if (search) {
    // Merge query parameters
    const newParams = new URLSearchParams(search)
    for (const [key, value] of newParams.entries()) {
      newUrl.searchParams.set(key, value)
    }
  }

  return newUrl
}

/**
 * Checks if a status code is a redirect status code
 */
export function isRedirectStatus(status: number | undefined): boolean {
  if (!status) return false
  return status >= 300 && status < 400
}

/**
 * Checks if headers contain redirect headers (Location or Refresh)
 */
export function hasRedirectHeaders(headers: Record<string, string>): boolean {
  const lowerCaseKeys = Object.keys(headers).map((k) => k.toLowerCase())
  return lowerCaseKeys.includes('location') || lowerCaseKeys.includes('refresh')
}
