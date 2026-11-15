/**
 * Replaces $1, $2, etc. and $name placeholders in the destination string
 * with matches from the regex and has conditions
 */
export function replaceDestination(
  destination: string,
  regexMatches: RegExpMatchArray | null,
  hasCaptures: Record<string, string>
): string {
  const captureKeys = Object.keys(hasCaptures)

  if (regexMatches) {
    for (let index = 1; index < regexMatches.length; index++) {
      captureKeys.push(String(index))
    }
    if (regexMatches.groups) {
      captureKeys.push(...Object.keys(regexMatches.groups))
    }
  }

  if (captureKeys.length === 0) {
    return destination
  }

  const capturePattern = captureKeys
    .sort((first, second) => second.length - first.length)
    .map((key) => {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      return /^\d+$/.test(key) ? `${escapedKey}(?!\\d)` : escapedKey
    })
    .join('|')

  // Replace placeholders once. Captured paths can contain literal text such as
  // $2 or $d$segment that must not become another substitution.
  return destination.replace(
    new RegExp(`\\$(${capturePattern})`, 'g'),
    (placeholder, key: string) => {
      if (regexMatches) {
        const index = Number(key)
        if (
          Number.isInteger(index) &&
          index > 0 &&
          index < regexMatches.length &&
          String(index) === key
        ) {
          return regexMatches[index] ?? ''
        }
        if (regexMatches.groups && Object.hasOwn(regexMatches.groups, key)) {
          return regexMatches.groups[key] ?? ''
        }
      }
      if (Object.hasOwn(hasCaptures, key)) {
        return hasCaptures[key]
      }
      return placeholder
    }
  )
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
