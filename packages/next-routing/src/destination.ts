function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Replaces $1, $2, etc. and $name placeholders in the destination string
 * with matches from the regex and has conditions
 */
export function replaceDestination(
  destination: string,
  regexMatches: RegExpMatchArray | null,
  hasCaptures: Record<string, string>
): string {
  const captures = new Map<string, string>()

  // Numbered captures from regex ($1, $2, etc.), skipping index 0 which is the
  // full match
  if (regexMatches) {
    for (let i = 1; i < regexMatches.length; i++) {
      captures.set(String(i), regexMatches[i] ?? '')
    }

    if (regexMatches.groups) {
      for (const [name, value] of Object.entries(regexMatches.groups)) {
        if (!captures.has(name)) {
          captures.set(name, value ?? '')
        }
      }
    }
  }

  for (const [name, value] of Object.entries(hasCaptures)) {
    if (!captures.has(name)) {
      captures.set(name, value)
    }
  }

  if (captures.size === 0) {
    return destination
  }

  // Longest name first so `$id` doesn't consume the `$id` of `$idType`, and
  // `$1` doesn't consume the `$1` of `$10`
  const names = Array.from(captures.keys()).sort((a, b) => b.length - a.length)
  const placeholder = new RegExp(
    `\\$(${names.map(escapeRegExp).join('|')})`,
    'g'
  )

  // A replacer function keeps `$&`, `` $` `` and `$'` inside captured values
  // from being expanded again
  return destination.replace(
    placeholder,
    (_, name: string) => captures.get(name)!
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
