import { FileReader } from './helpers/file-reader/file-reader'
import { AppPageRouteMatcher } from '../../route-matchers/app-page-route-matcher'
import { RouteKind } from '../../route-kind'
import { FileCacheRouteMatcherProvider } from './file-cache-route-matcher-provider'

import { DevAppNormalizers } from '../../normalizers/built/app'

export class DevAppPageRouteMatcherProvider extends FileCacheRouteMatcherProvider<AppPageRouteMatcher> {
  private readonly expression: RegExp
  private readonly normalizers: DevAppNormalizers

  constructor(
    appDir: string,
    extensions: ReadonlyArray<string>,
    reader: FileReader
  ) {
    super(appDir, reader)

    this.normalizers = new DevAppNormalizers(appDir, extensions)

    // Match any page file that ends with `/page.${extension}` under the app
    // directory.
    this.expression = new RegExp(`[/\\\\]page\\.(?:${extensions.join('|')})$`)
  }

  private prepare(files: ReadonlyArray<string>) {
    const routeAppPaths = new Map<string, Array<string>>()
    const routable = new Array<{
      filename: string
      page: string
      pathname: string
      appPaths: Array<string>
    }>()
    for (const filename of files) {
      // If the file isn't a match for this matcher, then skip it.
      if (!this.expression.test(filename)) continue

      const page = this.normalizers.page.normalize(filename)

      // Validate that this is not an ignored page, and skip it if it is.
      if (page.includes('/_')) continue

      const pathname = this.normalizers.pathname.normalize(filename)

      // Collect all the app paths for this page.
      let appPaths = routeAppPaths.get(pathname)
      if (!appPaths) {
        appPaths = [page]
        routeAppPaths.set(pathname, appPaths)
      } else {
        appPaths.push(page)

        // Sort the app paths so that we can compare them with other app paths,
        // the order must be deterministic.
        appPaths.sort()
      }

      // This is a valid file that we want to create a matcher for. We're using
      // the reference to the appPaths array that we created above, so that we
      // can re-use the memory for it.
      routable.push({ filename, page, pathname, appPaths })
    }

    return routable
  }

  protected async transform(
    files: ReadonlyArray<string>
  ): Promise<ReadonlyArray<AppPageRouteMatcher>> {
    const matchers: Array<AppPageRouteMatcher> = []
    for (const { filename, page, pathname, appPaths } of this.prepare(files)) {
      const bundlePath = this.normalizers.bundlePath.normalize(filename)

      matchers.push(
        new AppPageRouteMatcher({
          kind: RouteKind.APP_PAGE,
          pathname,
          page,
          bundlePath,
          filename,
          appPaths,
        })
      )
    }

    return matchers
  }
}
