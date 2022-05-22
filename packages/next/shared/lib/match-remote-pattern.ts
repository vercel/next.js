import type { RemotePattern } from './image-config'

export function matchRemotePattern(pattern: RemotePattern, url: URL): boolean {
  if (pattern.protocol !== undefined) {
    const actualProto = url.protocol.slice(0, -1)
    if (pattern.protocol !== actualProto) {
      return false
    }
  }
  if (pattern.port !== undefined) {
    if (pattern.port !== url.port) {
      return false
    }
  }
  if (pattern.pathname !== undefined) {
    const patternParts = pattern.pathname.split('/')
    const actualParts = url.pathname.split('/')
    const len = Math.max(patternParts.length, actualParts.length)
    for (let i = 0; i < len; i++) {
      if (patternParts[i] === '**' && actualParts[i] !== undefined) {
        // Double asterisk means "match everything until the end of the path"
        // so we can break the loop early. But we throw
        // if the double asterisk is not the last part.
        if (patternParts.length - 1 > i) {
          throw new Error(
            `Pattern can only contain ** at end of pathname but found "${pattern.pathname}"`
          )
        }
        break
      }
      if (patternParts[i] === '*') {
        // Single asterisk means "match this part" so we can
        // continue to the next part of the loop
        continue
      }
      if (patternParts[i] !== actualParts[i]) {
        return false
      }
    }
  }

  if (pattern.hostname === undefined) {
    throw new Error(
      `Pattern should define hostname but found\n${JSON.stringify(pattern)}`
    )
  } else {
    const patternParts = pattern.hostname.split('.').reverse()
    const actualParts = url.hostname.split('.').reverse()
    const len = Math.max(patternParts.length, actualParts.length)
    for (let i = 0; i < len; i++) {
      if (patternParts[i] === '**' && actualParts[i] !== undefined) {
        // Double asterisk means "match every subdomain"
        // so we can break the loop early. But we throw
        // if the double asterisk is not the last part.
        if (patternParts.length - 1 > i) {
          throw new Error(
            `Pattern can only contain ** at start of hostname but found "${pattern.hostname}"`
          )
        }
        break
      }
      if (patternParts[i] === '*') {
        // Single asterisk means "match this subdomain" so we can
        // continue to the next part of the loop
        continue
      }
      if (patternParts[i] !== actualParts[i]) {
        return false
      }
    }
  }
  return true
}

export function hasMatch(
  domains: string[],
  remotePatterns: RemotePattern[],
  url: URL
): boolean {
  return (
    domains.some((domain) => url.hostname === domain) ||
    remotePatterns.some((p) => matchRemotePattern(p, url))
  )
}
