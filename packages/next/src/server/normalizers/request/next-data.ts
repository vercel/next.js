import type { Page, Route } from '../../../shared/lib/route-types'
import type { PathnameNormalizer } from './pathname-normalizer'

import { denormalizePagePath } from '../../../shared/lib/page-path/denormalize-page-path'
import { PrefixPathnameNormalizer } from './prefix'
import { SuffixPathnameNormalizer } from './suffix'

export class NextDataPathnameNormalizer implements PathnameNormalizer {
  private readonly prefix: PrefixPathnameNormalizer
  private readonly suffix = new SuffixPathnameNormalizer('.json')
  constructor(buildID: string) {
    if (!buildID) {
      throw new Error('Invariant: buildID is required')
    }

    this.prefix = new PrefixPathnameNormalizer(`/_next/data/${buildID}`)
  }

  public match(pathname: Route) {
    return this.prefix.match(pathname) && this.suffix.match(pathname)
  }

  public normalize(pathname: Route, matched?: boolean): Route {
    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    pathname = this.prefix.normalize(pathname, true)
    pathname = this.suffix.normalize(pathname, true)

    // The data URL encodes a Pages-router page filename. Decode that filename
    // at this boundary; Pages-router identifiers map directly to URL paths.
    return denormalizePagePath(pathname as string as Page) as string as Route
  }
}
