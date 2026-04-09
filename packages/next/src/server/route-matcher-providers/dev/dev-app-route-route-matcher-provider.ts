import type { FileReader } from './helpers/file-reader/file-reader'
import type { Normalizer } from '../../normalizers/normalizer'
import { AppRouteRouteMatcher } from '../../route-matchers/app-route-route-matcher'
import { RouteKind } from '../../route-kind'
import { FileCacheRouteMatcherProvider } from './file-cache-route-matcher-provider'
import { isAppRouteRoute } from '../../../lib/is-app-route-route'
import { DevAppNormalizers } from '../../normalizers/built/app'
import {
  isMetadataRouteFile,
  isStaticMetadataRoute,
  isStaticMetadataFile,
} from '../../../lib/metadata/is-metadata-route'
import { normalizeMetadataPageToRoute } from '../../../lib/metadata/get-metadata-route'
import path from '../../../shared/lib/isomorphic/path'

export class DevAppRouteRouteMatcherProvider extends FileCacheRouteMatcherProvider<AppRouteRouteMatcher> {
  private readonly normalizers: {
    page: Normalizer
    pathname: Normalizer
    bundlePath: Normalizer
  }
  private readonly appDir: string
  private readonly isTurbopack: boolean

  constructor(
    appDir: string,
    extensions: ReadonlyArray<string>,
    reader: FileReader,
    isTurbopack: boolean
  ) {
    super(appDir, reader)

    this.appDir = appDir
    this.isTurbopack = isTurbopack
    this.normalizers = new DevAppNormalizers(appDir, extensions, isTurbopack)
  }

  protected async transform(
    files: ReadonlyArray<string>
  ): Promise<ReadonlyArray<AppRouteRouteMatcher>> {
    const matchers: Array<AppRouteRouteMatcher> = []
    for (const filename of files) {
      // Skip static metadata files as they are served from filesystem.
      if (isStaticMetadataFile(filename.replace(this.appDir, ''))) {
        continue
      }

      let page = this.normalizers.page.normalize(filename)

      // If the file isn't a match for this matcher, then skip it.
      if (!isAppRouteRoute(page)) continue

      // Validate that this is not an ignored page.
      if (page.includes('/_')) continue

      // Turbopack uses the correct page name with the underscore normalized.
      // TODO: Move implementation to packages/next/src/server/normalizers/built/app/app-page-normalizer.ts.
      // The `includes('/_')` check above needs to be moved for that to work as otherwise `%5Fsegmentname`
      // will result in `_segmentname` which hits that includes check and be skipped.
      if (this.isTurbopack) {
        page = page.replace(/%5F/g, '_')
      }

      const pathname = this.normalizers.pathname.normalize(filename)
      const bundlePath = this.normalizers.bundlePath.normalize(filename)
      const ext = path.extname(filename).slice(1)
      const isEntryMetadataRouteFile = isMetadataRouteFile(
        filename.replace(this.appDir, ''),
        [ext],
        true
      )

      if (isEntryMetadataRouteFile && !isStaticMetadataRoute(page)) {
        // Matching dynamic metadata routes.
        // Add 2 possibilities for both single and multiple routes:
        {
          // single:
          // /sitemap.ts -> /sitemap.xml/route
          // /icon.ts -> /icon/route
          // We'll map the filename before normalization:
          // sitemap.ts -> sitemap.xml/route.ts
          // icon.ts -> icon/route.ts
          const metadataPage = normalizeMetadataPageToRoute(page, false)
          const metadataPathname = normalizeMetadataPageToRoute(pathname, false)
          const metadataBundlePath = normalizeMetadataPageToRoute(
            bundlePath,
            false
          )

          const matcher = new AppRouteRouteMatcher({
            kind: RouteKind.APP_ROUTE,
            page: metadataPage,
            pathname: metadataPathname,
            bundlePath: metadataBundlePath,
            filename,
          })
          matchers.push(matcher)
        }
        {
          // multiple:
          // /sitemap.ts -> /sitemap/[__metadata_id__]/route
          // /icon.ts -> /icon/[__metadata_id__]/route
          // We'll map the filename before normalization:
          // sitemap.ts -> sitemap.xml/[__metadata_id__].ts
          // icon.ts -> icon/[__metadata_id__].ts
          const metadataPage = normalizeMetadataPageToRoute(page, true)
          const metadataPathname = normalizeMetadataPageToRoute(pathname, true)
          const metadataBundlePath = normalizeMetadataPageToRoute(
            bundlePath,
            true
          )

          const matcher = new AppRouteRouteMatcher({
            kind: RouteKind.APP_ROUTE,
            page: metadataPage,
            pathname: metadataPathname,
            bundlePath: metadataBundlePath,
            filename,
          })
          matchers.push(matcher)
        }
      } else {
        // Normal app routes.
        matchers.push(
          new AppRouteRouteMatcher({
            kind: RouteKind.APP_ROUTE,
            page,
            pathname,
            bundlePath,
            filename,
          })
        )
      }
    }

    return matchers
  }
}
