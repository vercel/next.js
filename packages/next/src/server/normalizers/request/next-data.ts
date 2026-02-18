import type { PathnameNormalizer } from './pathname-normalizer'

import { denormalizePagePath } from '../../../shared/lib/page-path/denormalize-page-path'
import { parseDataPathname } from '../../../shared/lib/page-path/normalize-data-path'

export class NextDataPathnameNormalizer implements PathnameNormalizer {
  private readonly buildID: string

  constructor(buildID: string) {
    if (!buildID) {
      throw new Error('Invariant: buildID is required')
    }

    this.buildID = buildID
  }

  public match(pathname: string) {
    const dataPathnameInfo = parseDataPathname(pathname)
    return dataPathnameInfo?.buildId === this.buildID
  }

  public normalize(pathname: string, matched?: boolean): string {
    // If we're not matched and we don't match, we don't need to normalize.
    if (!matched && !this.match(pathname)) return pathname

    const dataPathnameInfo = parseDataPathname(pathname)

    if (!dataPathnameInfo || dataPathnameInfo.buildId !== this.buildID) {
      return pathname
    }

    return denormalizePagePath(dataPathnameInfo.pathname)
  }
}
