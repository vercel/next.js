import type { PathnameNormalizer } from './pathname-normalizer'

import { hasVariantsPrefix, removeVariantsPrefix } from '../../variants/prefix'

/**
 * Removes the internal variants prefix that the edge adapter adds, and gives
 * the route pathname back before route resolution.
 *
 * This class removes the prefix and nothing else, because the prefix is all the
 * path carries. The segment is a hash of the combination. It names the
 * prerender to serve, but nothing can read it back into values. The values
 * arrive separately, in `NEXT_VARIANTS_HEADER`.
 */
export class VariantsPathnameNormalizer implements PathnameNormalizer {
  // The pathname still carries the base path here. The prefix sits after it,
  // and a separate normalizer removes the base path later.
  constructor(private readonly basePath?: string) {}

  public match(pathname: string): boolean {
    return hasVariantsPrefix(pathname, this.basePath)
  }

  public normalize(pathname: string): string {
    return removeVariantsPrefix(pathname, this.basePath)
  }
}
