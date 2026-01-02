import type { RouteHas } from './types'

/**
 * Checks if a value matches the condition.
 * If conditionValue is undefined, returns the key's value if it exists.
 * If conditionValue is defined, it can be a regex string or a direct match.
 */
function matchesCondition(
  actualValue: string | undefined,
  conditionValue: string | undefined
): { matched: boolean; capturedValue?: string } {
  if (actualValue === undefined) {
    return { matched: false }
  }

  // If no value condition is specified, match if key exists and return its value
  if (conditionValue === undefined) {
    return { matched: true, capturedValue: actualValue }
  }

  // Try to match as regex first
  try {
    const regex = new RegExp(conditionValue)
    const match = actualValue.match(regex)
    if (match) {
      return { matched: true, capturedValue: match[0] }
    }
  } catch (e) {
    // Not a valid regex, fall through to direct match
  }

  // Direct string match
  if (actualValue === conditionValue) {
    return { matched: true, capturedValue: actualValue }
  }

  return { matched: false }
}

/**
 * Extracts the value for a RouteHas condition from the request context
 */
function getConditionValue(
  condition: RouteHas,
  url: URL,
  headers: Headers
): string | undefined {
  switch (condition.type) {
    case 'header':
      return headers.get(condition.key) || undefined
    case 'cookie': {
      const cookieHeader = headers.get('cookie')
      if (!cookieHeader) return undefined

      // Parse cookies
      const cookies = cookieHeader.split(';').reduce(
        (acc, cookie) => {
          const [key, ...valueParts] = cookie.trim().split('=')
          if (key) {
            acc[key] = valueParts.join('=')
          }
          return acc
        },
        {} as Record<string, string>
      )

      return cookies[condition.key]
    }
    case 'query':
      return url.searchParams.get(condition.key) || undefined
    case 'host':
      return url.hostname
    default:
      return ''
  }
}

/**
 * Normalizes a capture key to only contain a-zA-Z characters
 */
function normalizeCaptureKey(key: string): string {
  return key.replace(/[^a-zA-Z]/g, '')
}

/**
 * Checks if all "has" conditions are satisfied
 */
export function checkHasConditions(
  has: RouteHas[] | undefined,
  url: URL,
  headers: Headers
): { matched: boolean; captures: Record<string, string> } {
  if (!has || has.length === 0) {
    return { matched: true, captures: {} }
  }

  const captures: Record<string, string> = {}

  for (const condition of has) {
    const actualValue = getConditionValue(condition, url, headers)
    const result = matchesCondition(actualValue, condition.value)

    if (!result.matched) {
      return { matched: false, captures: {} }
    }

    // Store captured value with normalized key name for named replacements
    if (result.capturedValue !== undefined && condition.type !== 'host') {
      const normalizedKey = normalizeCaptureKey(condition.key)
      captures[normalizedKey] = result.capturedValue
    }
  }

  return { matched: true, captures }
}

/**
 * Checks if all "missing" conditions are satisfied (i.e., none of them match)
 */
export function checkMissingConditions(
  missing: RouteHas[] | undefined,
  url: URL,
  headers: Headers
): boolean {
  if (!missing || missing.length === 0) {
    return true
  }

  for (const condition of missing) {
    const actualValue = getConditionValue(condition, url, headers)
    const result = matchesCondition(actualValue, condition.value)

    // If any missing condition matches, the check fails
    if (result.matched) {
      return false
    }
  }

  return true
}
