import type { AppPageRouteDefinition } from '../app-page-route-definition'

import { isAppPageRoute } from '../../../../lib/is-app-page-route'
import { AppBundlePathNormalizer } from '../../normalizers/built/app/app-bundle-path-normalizer'
import { AppPathnameNormalizer } from '../../normalizers/built/app/app-pathname-normalizer'
import { RouteKind } from '../../route-kind'
import { RouteDefinitionBuilder } from './route-definition-builder'
import { isInternalAppRoute } from '../../../../lib/is-internal-app-route'

type AppPageRouteDefinitionBuilderInput = Pick<
  AppPageRouteDefinition,
  'page' | 'filename'
>

export class AppPageRouteDefinitionBuilder extends RouteDefinitionBuilder<
  AppPageRouteDefinition,
  AppPageRouteDefinitionBuilderInput
> {
  private static readonly normalizers = {
    pathname: new AppPathnameNormalizer(),
    bundlePath: new AppBundlePathNormalizer(),
  }

  private readonly appPaths = new Map<string, string[]>()

  public add({ page, filename }: AppPageRouteDefinitionBuilderInput) {
    if (!isAppPageRoute(page) && !isInternalAppRoute(page)) {
      throw new Error(`Invariant: page is not an app page: ${page}`)
    }

    const pathname =
      AppPageRouteDefinitionBuilder.normalizers.pathname.normalize(page)
    const bundlePath =
      AppPageRouteDefinitionBuilder.normalizers.bundlePath.normalize(page)

    // Get or create the app paths value for this definition.
    let appPaths = this.appPaths.get(pathname)
    if (!appPaths) {
      // We're the first one, so create the array.
      appPaths = [page]
      this.appPaths.set(pathname, appPaths)
    } else {
      // We're not the first one, so push our page onto the array.
      appPaths.push(page)

      // Sort the app paths (that are shared by all definitions in this
      // definition by reference).
      appPaths.sort()

      // If true, then this definition we're about to add is the last
      // definition and we can remove the existing definition from the array.
      // If this is false, then it means that this definition is not the last
      // one, and therefore it should not be added.
      if (appPaths[appPaths.length - 1] !== page) return

      // Find the index of the existing definition so we can remove it.
      const index = this.definitions.findIndex(
        (definition) => definition.pathname === pathname
      )

      // Remove the existing definition from the array.
      if (index !== -1) {
        this.definitions.splice(index, 1)
      }
    }

    this.definitions.push({
      kind: RouteKind.APP_PAGE,
      identity: pathname,
      bundlePath,
      filename,
      page,
      pathname,
      // The appPaths array here is a reference to the one in the appPaths map,
      // so this will re-use the same array (and any sort or push that occurs
      // in the future).
      appPaths,
    })
  }
}
