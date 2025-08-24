import { SERVER_DIRECTORY } from '../../../../shared/lib/constants'
import { PrefixingNormalizer } from '../../prefixing-normalizer'

export class AppFilenameNormalizer extends PrefixingNormalizer {
  constructor(distDir: string) {
    super(distDir, SERVER_DIRECTORY)
  }

  public normalize(manifestFilename: string): string {
    return super.normalize(manifestFilename)
  }
}
