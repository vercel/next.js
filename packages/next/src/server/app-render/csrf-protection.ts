// micromatch is only available at node runtime, so it cannot be used here since the code path that calls this function
// can be run from edge. This is a simple implementation that safely achieves the required functionality.
// the goal is to match the functionality for remotePatterns as defined here -
// https://nextjs.org/docs/app/api-reference/components/image#remotepatterns
// TODO - retrofit micromatch to work in edge and use that instead
function matchWildcardDomain(domain: string, pattern: string) {
  const domainParts = domain.split('.')
  const patternParts = pattern.split('.')

  // Iterate through each part and compare them
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i] === '**') {
      // If '**' is encountered, ensure remaining domain ends with remaining pattern
      // e.g. **.y.z and a.b.c.y.z should match (b.c.y.z ends with y.z)
      const remainingPattern = patternParts.slice(i + 1).join('.')
      const remainingDomain = domainParts.slice(i + 1).join('.')
      return remainingDomain.endsWith(remainingPattern)
    } else if (patternParts[i] === '*') {
      // If '*' is encountered, ensure remaining domain is equal to remaining pattern
      // e.g. *.y.z and c.y.z should match (y.z is equal to y.z)
      const remainingPattern = patternParts.slice(i + 1).join('.')
      const remainingDomain = domainParts.slice(i + 1).join('.')
      return remainingDomain === remainingPattern
    }

    // If '*' is not encountered, compare the parts
    if (patternParts[i] !== domainParts[i]) {
      return false
    }
  }

  return true
}

export const isCsrfOriginAllowed = (
  originDomain: string,
  allowedOrigins: string[] = []
): boolean => {
  return allowedOrigins.some(
    (allowedOrigin) =>
      allowedOrigin &&
      (allowedOrigin === originDomain ||
        matchWildcardDomain(originDomain, allowedOrigin))
  )
}
