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
import { PAGE_TYPES } from '../../../lib/page-types'
import { promises as fs } from 'fs'
import { createHash } from 'crypto'

export class DevAppRouteRouteMatcherProvider extends FileCacheRouteMatcherProvider<AppRouteRouteMatcher> {
  private readonly normalizers: {
    page: Normalizer
    pathname: Normalizer
    bundlePath: Normalizer
  }
  private readonly appDir: string
  private readonly isTurbopack: boolean
  /**
   * A digest of each dynamic metadata file's contents as of the last
   * `transform()`, keyed by filename. Whether such a file also serves the
   * `[__metadata_id__]` variant depends on its exports, so editing one has to
   * invalidate the matchers even though the file list is unchanged. Contents
   * are digested rather than stat'd because filesystem timestamps aren't
   * granular enough to catch edits made in quick succession.
   */
  private readonly metadataFileDigests = new Map<string, string>()

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

  private async digest(filename: string): Promise<string | null> {
    try {
      return createHash('sha1')
        .update(await fs.readFile(filename))
        .digest('hex')
    } catch {
      // The file is unreadable now, treat it as changed so the matchers catch
      // up on the next transform.
      return null
    }
  }

  protected async isStale(): Promise<boolean> {
    for (const [filename, digest] of this.metadataFileDigests) {
      if ((await this.digest(filename)) !== digest) return true
    }

    return false
  }

  protected async transform(
    files: ReadonlyArray<string>
  ): Promise<ReadonlyArray<AppRouteRouteMatcher>> {
    const matchers: Array<AppRouteRouteMatcher> = []
    this.metadataFileDigests.clear()
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
        // Only metadata files that export `generateSitemaps` /
        // `generateImageMetadata` are served from the multiple-route variant.
        // Registering that variant unconditionally makes
        // `/sitemap/[__metadata_id__]` swallow unrelated user routes that live
        // under the same segment (e.g. `/sitemap/[...attrs]`), because the
        // bundler never emits an entrypoint for it.
        const getPageStaticInfo = (
          require('../../../build/analysis/get-page-static-info') as typeof import('../../../build/analysis/get-page-static-info')
        ).getPageStaticInfo

        // Digest the contents *before* reading the static info out of them, so
        // that a write landing in between is seen as a change on the next
        // `isStale()` check instead of being recorded as already applied.
        const digest = await this.digest(filename)

        const staticInfo = await getPageStaticInfo({
          pageFilePath: filename,
          nextConfig: {},
          page,
          isDev: true,
          pageType: PAGE_TYPES.APP,
        })
        const hasMultipleRoutes = !!(
          staticInfo.generateSitemaps || staticInfo.generateImageMetadata
        )

        if (digest !== null) {
          this.metadataFileDigests.set(filename, digest)
        }

        // Matching dynamic metadata routes.
        // The single route always exists; the multiple route only when the
        // metadata file generates several of them:
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
        if (hasMultipleRoutes) {
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
