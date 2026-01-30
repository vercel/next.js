import { pathHasPrefix } from '../router/utils/path-has-prefix'
import { getDeploymentId } from '../deployment-id'

/**
 * strip _next/data/(<build-id>/) prefix and .json suffix
 * When deploymentId is set, the path does NOT contain build-id.
 */
export function normalizeDataPath(pathname: string) {
  if (!pathHasPrefix(pathname || '/', '/_next/data')) {
    return pathname
  }

  if (getDeploymentId()) {
    pathname = pathname.replace(/\/_next\/data/, '')
  } else {
    pathname = pathname.replace(/\/_next\/data\/[^/]+/, '')
  }

  pathname = pathname.replace(/\.json$/, '')

  if (pathname === '/index') {
    return '/'
  }
  return pathname
}
