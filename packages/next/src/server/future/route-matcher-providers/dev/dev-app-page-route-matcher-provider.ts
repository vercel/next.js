import type { FileReader } from './helpers/file-reader/file-reader'
import { AppPageRouteMatcher } from '../../route-matchers/app-page-route-matcher'
import { RouteKind } from '../../route-kind'
import { FileCacheRouteMatcherProvider } from './file-cache-route-matcher-provider'

import { DevAppNormalizers } from '../../normalizers/built/app'
import { normalizeCatchAllRoutes } from '../../../../build/normalize-catchall-routes'

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

    // Match any page file that ends with `/page.${extension}` or `/default.${extension}` under the app
    // directory.
    this.expression = new RegExp(
      `[/\\\\](page|default)\\.(?:${extensions.join('|')})$`
    )
  }

  protected async transform(
    files: ReadonlyArray<string>
  ): Promise<ReadonlyArray<AppPageRouteMatcher>> {
    // Collect all the app paths for each page. This could include any parallel
    // routes.
    const cache = new Map<
      string,
      { page: string; pathname: string; bundlePath: string }
    >()
    const routeFilenames = new Array<string>()
    let appPaths: Record<string, string[]> = {}
    for (const filename of files) {
      // If the file isn't a match for this matcher, then skip it.
      if (!this.expression.test(filename)) continue

      const page = this.normalizers.page.normalize(filename)

      // Validate that this is not an ignored page.
      if (page.includes('/_')) continue

      // This is a valid file that we want to create a matcher for.
      routeFilenames.push(filename)

      const pathname = this.normalizers.pathname.normalize(filename)
      const bundlePath = this.normalizers.bundlePath.normalize(filename)

      // Save the normalization results.
      cache.set(filename, { page, pathname, bundlePath })

      if (pathname in appPaths) appPaths[pathname].push(page)
      else appPaths[pathname] = [page]
    }

    normalizeCatchAllRoutes(appPaths)

    // Make sure to sort parallel routes to make the result deterministic.
    appPaths = Object.fromEntries(
      Object.entries(appPaths).map(([k, v]) => [k, v.sort()])
    )

    const matchers: Array<AppPageRouteMatcher> = []
    for (const filename of routeFilenames) {
      // Grab the cached values (and the appPaths).
      const cached = cache.get(filename)
      if (!cached) {
        throw new Error('Invariant: expected filename to exist in cache')
      }
      const { pathname, page, bundlePath } = cached

      matchers.push(
        new AppPageRouteMatcher({
          kind: RouteKind.APP_PAGE,
          pathname,
          page,
          bundlePath,
          filename,
          appPaths: appPaths[pathname],
        })
      )
    }
    return matchers
  }
}
