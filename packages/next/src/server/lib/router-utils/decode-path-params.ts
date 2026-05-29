import escapePathDelimiters from '../../../shared/lib/router/utils/escape-path-delimiters'
import { DecodeError } from '../../../shared/lib/utils'

/**
 * We only encode path delimiters for path segments from
 * getStaticPaths so we need to attempt decoding the URL
 * to match against and only escape the path delimiters
 * this allows non-ascii values to be handled e.g.
 * Japanese characters.
 * */
function decodePathParams(pathname: string): string {
  // TODO: investigate adding this handling for non-SSG
  // pages so non-ascii names also work there.
  return pathname
    .split('/')
    .map((seg) => {
      try {
        seg = escapePathDelimiters(decodeURIComponent(seg), true)
      } catch (_) {
        // An improperly encoded URL was provided
        throw new DecodeError('Failed to decode path param(s).')
      }
      return seg
    })
    .join('/')
}

export { decodePathParams }
