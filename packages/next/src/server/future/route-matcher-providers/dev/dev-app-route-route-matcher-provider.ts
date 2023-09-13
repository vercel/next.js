import type { FileReader } from '../../helpers/file-reader/file-reader'

import { AppRouteRouteMatcher } from '../../route-matchers/app-route-route-matcher'
import { Normalizer } from '../../normalizers/normalizer'
import { RouteKind } from '../../route-kind'
import { FileCacheRouteMatcherProvider } from './file-cache-route-matcher-provider'
import { isAppRouteRoute } from '../../../../lib/is-app-route-route'
import { DevAppNormalizers } from '../../normalizers/built/app'

export class DevAppRouteRouteMatcherProvider extends FileCacheRouteMatcherProvider<AppRouteRouteMatcher> {
  private readonly normalizers: {
    page: Normalizer
    pathname: Normalizer
    bundlePath: Normalizer
  }

  constructor(
    appDir: string,
    extensions: ReadonlyArray<string>,
    reader: FileReader
  ) {
    super(appDir, reader, true)

    this.normalizers = new DevAppNormalizers(appDir, extensions)
  }

  protected filter(filename: string): boolean {
    const page = this.normalizers.page.normalize(filename)

    // If the file isn't a match for this matcher, then skip it.
    if (!isAppRouteRoute(page)) return false

    // Validate that this is not an ignored page.
    if (page.includes('/_')) return false

    return true
  }

  protected async transform(
    files: ReadonlyArray<string>
  ): Promise<ReadonlyArray<AppRouteRouteMatcher>> {
    const matchers: Array<AppRouteRouteMatcher> = []
    for (const filename of files) {
      const page = this.normalizers.page.normalize(filename)
      const pathname = this.normalizers.pathname.normalize(filename)
      const bundlePath = this.normalizers.bundlePath.normalize(filename)

      matchers.push(
        new AppRouteRouteMatcher({
          kind: RouteKind.APP_ROUTE,
          pathname,
          page,
          bundlePath,
          filename,
        })
      )
    }

    return matchers
  }
}
