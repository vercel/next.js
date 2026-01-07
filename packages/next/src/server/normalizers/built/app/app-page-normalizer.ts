import { PAGE_TYPES } from '../../../../lib/page-types'
import { AbsoluteFilenameNormalizer } from '../../absolute-filename-normalizer'
import { Normalizers } from '../../normalizers'

/**
 * DevAppPageNormalizer is a normalizer that is used to normalize a pathname
 * to a page in the `app` directory.
 */
class DevAppPageNormalizerInternal extends AbsoluteFilenameNormalizer {
  constructor(appDir: string, extensions: ReadonlyArray<string>) {
    super(appDir, extensions, PAGE_TYPES.APP)
  }
}

export class DevAppPageNormalizer extends Normalizers {
  constructor(
    appDir: string,
    extensions: ReadonlyArray<string>,
    _isTurbopack: boolean
  ) {
    const normalizer = new DevAppPageNormalizerInternal(appDir, extensions)
    super(
      // %5F to _ replacement should only happen with Turbopack.
      // TODO: enable when page matcher `/_` check is moved: https://github.com/vercel/next.js/blob/8eda00bf5999e43e8f0211bd72c981d5ce292e8b/packages/next/src/server/route-matcher-providers/dev/dev-app-route-route-matcher-provider.ts#L48
      // isTurbopack
      //   ? [
      //       // The page should have the `%5F` characters replaced with `_` characters.
      //       new UnderscoreNormalizer(),
      //       normalizer,
      //     ]
      //   : [normalizer]
      [normalizer]
    )
  }
}
