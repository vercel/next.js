import { PAGE_TYPES } from '../../../../../lib/page-types'
import { AbsoluteFilenameNormalizer } from '../../absolute-filename-normalizer'

export class DevPagesPageNormalizer extends AbsoluteFilenameNormalizer {
  constructor(pagesDir: string, extensions: ReadonlyArray<string>) {
    super(pagesDir, extensions, PAGE_TYPES.PAGES)
  }
}
