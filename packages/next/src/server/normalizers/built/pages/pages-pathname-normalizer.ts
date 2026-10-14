import type { Route } from '../../../../shared/lib/route-types'
import { PAGE_TYPES } from '../../../../lib/page-types'
import { AbsoluteFilenameNormalizer } from '../../absolute-filename-normalizer'

export class DevPagesPathnameNormalizer extends AbsoluteFilenameNormalizer<Route> {
  constructor(pagesDir: string, extensions: ReadonlyArray<string>) {
    super(pagesDir, extensions, PAGE_TYPES.PAGES)
  }
}
