import { AbsoluteFilenameNormalizer } from '../../absolute-filename-normalizer'

export class DevPagesPageNormalizer extends AbsoluteFilenameNormalizer {
  constructor(pagesDir: string, pageExtensions: ReadonlyArray<string>) {
    super(pagesDir, pageExtensions, 'pages')
  }
}
