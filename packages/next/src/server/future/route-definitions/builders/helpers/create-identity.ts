import { stringify } from 'querystring'

export function createIdentity(
  pathname: string,
  query?: Record<string, string | undefined>
): string {
  if (!query || Object.keys(query).length === 0) {
    return pathname
  }

  return `${pathname}?${stringify(query)}`
}
