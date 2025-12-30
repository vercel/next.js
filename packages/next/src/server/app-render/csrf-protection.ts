// micromatch is only available at node runtime, so it cannot be used here since the code path that calls this function
// can be run from edge. This is a simple implementation that safely achieves the required functionality.
// the goal is to match the functionality for remotePatterns as defined here -
// https://nextjs.org/docs/app/api-reference/components/image#remotepatterns
// TODO - retrofit micromatch to work in edge and use that instead
function matchWildcardDomain(domain: string, pattern: string) {
  const domainParts = domain.split('.')
  const patternParts = pattern.split('.')

  if (patternParts.length < 1) {
    // pattern is empty and therefore invalid to match against
    return false
  }

  if (domainParts.length < patternParts.length) {
    // domain has too few segments and thus cannot match
    return false
  }

  // Prevent wildcards from matching entire domains (e.g. '**' or '*.com')
  // This ensures wildcards can only match subdomains, not the main domain
  if (
    patternParts.length === 1 &&
    (patternParts[0] === '*' || patternParts[0] === '**')
  ) {
    return false
  }

  while (patternParts.length) {
    const patternPart = patternParts.pop()
    const domainPart = domainParts.pop()

    switch (patternPart) {
      case '': {
        // invalid pattern. pattern segments must be non empty
        return false
      }
      case '*': {
        // wildcard matches anything so we continue if the domain part is non-empty
        if (domainPart) {
          continue
        } else {
          return false
        }
      }
      case '**': {
        // if this is not the last item in the pattern the pattern is invalid
        if (patternParts.length > 0) {
          return false
        }
        // recursive wildcard matches anything so we terminate here if the domain part is non empty
        return domainPart !== undefined
      }
      case undefined:
      default: {
        if (domainPart !== patternPart) {
          return false
        }
      }
    }
  }

  // We exhausted the pattern. If we also exhausted the domain we have a match
  return domainParts.length === 0
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
