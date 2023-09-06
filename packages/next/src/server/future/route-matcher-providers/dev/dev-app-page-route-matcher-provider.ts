import { FileReader } from './helpers/file-reader/file-reader'
import { AppPageRouteMatcher } from '../../route-matchers/app-page-route-matcher'
import { FileCacheRouteMatcherProvider } from './file-cache-route-matcher-provider'
import { DevAppNormalizers } from '../../normalizers/built/app'
import { AppRouteDefinitionBuilder } from '../builders/app-route-definition-builder'
import { isAppPageRouteDefinition } from '../../route-definitions/app-page-route-definition'

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
    const routes = new AppRouteDefinitionBuilder()
    for (const filename of files) {
      // If the file isn't a match for this matcher, then skip it.
      if (!this.expression.test(filename)) continue

      const page = this.normalizers.page.normalize(filename)

      // Validate that this is not an ignored page, and skip it if it is.
      if (page.includes('/_')) continue

      // Collect all the app paths for this page.
      routes.add(page, filename)
    }

    return routes.toSortedDefinitions().filter(isAppPageRouteDefinition)
  }

  protected async transform(
    files: ReadonlyArray<string>
  ): Promise<ReadonlyArray<AppPageRouteMatcher>> {
    const matchers: Array<AppPageRouteMatcher> = []
    for (const definition of this.prepare(files)) {
      matchers.push(new AppPageRouteMatcher(definition))
    }

    return matchers
  }
}
