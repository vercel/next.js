import { AbsoluteFilenameNormalizer } from '../../absolute-filename-normalizer'

/**
 * DevAppPageNormalizer is a normalizer that is used to normalize a pathname
 * to a page in the `app` directory.
 */
export class DevAppPageNormalizer extends AbsoluteFilenameNormalizer {
  constructor(appDir: string, pageExtensions: ReadonlyArray<string>) {
    super(appDir, pageExtensions, 'app')
  }
}
