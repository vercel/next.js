import { AbsoluteFilenameNormalizer } from '../../absolute-filename-normalizer'

export class DevPagesPageNormalizer extends AbsoluteFilenameNormalizer {
  constructor(pagesDir: string, extensions: ReadonlyArray<string>) {
    super(pagesDir, extensions, 'pages')
  }
}
