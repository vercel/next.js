import { CACHE_ONE_YEAR } from '../../lib/constants'

/**
 * The revalidate option used internally for pages. A value of `false` means
 * that the page should not be revalidated. A number means that the page
 * should be revalidated after the given number of seconds (this also includes
 * `1` which means to revalidate after 1 second). A value of `0` is not a valid
 * value for this option.
 */
export type Revalidate = number | false

export function formatRevalidate(revalidate: Revalidate): string {
  if (revalidate === 0) {
    return 'private, no-cache, no-store, max-age=0, must-revalidate'
  } else if (typeof revalidate === 'number') {
    return `s-maxage=${revalidate}, stale-while-revalidate`
  }

  return `s-maxage=${CACHE_ONE_YEAR}, stale-while-revalidate`
}
