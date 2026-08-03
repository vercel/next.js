import type { PathnameNormalizer } from './pathname-normalizer'

import { hasVariantsPrefix, removeVariantsPrefix } from '../../variants/prefix'

/**
 * Strips the internal variants prefix that the edge adapter adds, recovering
 * the route pathname before route resolution.
 *
 * Only the prefix is removed here, because it is all the path carries: the
 * segment is a hash of the combination, which names the prerender to serve but
 * cannot be read back into values. The values arrive separately, in
 * `NEXT_VARIANTS_HEADER`, and are picked up by whoever needs them.
 */
export class VariantsPathnameNormalizer implements PathnameNormalizer {
  public match(pathname: string): boolean {
    return hasVariantsPrefix(pathname)
  }

  public normalize(pathname: string): string {
    return removeVariantsPrefix(pathname)
  }
}
