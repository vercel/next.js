import { getPathMatch } from '../../shared/lib/router/utils/path-match'

const matcher = getPathMatch('/_next/data/:path*', { sensitive: true })

export function matchNextDataPathname(pathname: string | null | undefined) {
  if (typeof pathname !== 'string') return false

  return matcher(pathname)
}
