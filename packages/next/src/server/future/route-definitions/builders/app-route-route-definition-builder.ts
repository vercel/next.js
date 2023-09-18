import type { AppRouteRouteDefinition } from '../app-route-route-definition'

import { AppBundlePathNormalizer } from '../../normalizers/built/app/app-bundle-path-normalizer'
import { AppPathnameNormalizer } from '../../normalizers/built/app/app-pathname-normalizer'
import { RouteKind } from '../../route-kind'
import { RouteDefinitionBuilder } from './route-definition-builder'
import { isAppRouteRoute } from '../../../../lib/is-app-route-route'

type AppRouteRouteDefinitionBuilderInput = Pick<
  AppRouteRouteDefinition,
  'page' | 'filename'
>

export class AppRouteRouteDefinitionBuilder extends RouteDefinitionBuilder<
  AppRouteRouteDefinition,
  AppRouteRouteDefinitionBuilderInput
> {
  private static readonly normalizers = {
    pathname: new AppPathnameNormalizer(),
    bundlePath: new AppBundlePathNormalizer(),
  }

  protected readonly definitions = new Array<AppRouteRouteDefinition>()

  public add({ page, filename }: AppRouteRouteDefinitionBuilderInput): void {
    if (!isAppRouteRoute(page)) {
      throw new Error(`Invariant: page is not an app route: ${page}`)
    }

    const pathname =
      AppRouteRouteDefinitionBuilder.normalizers.pathname.normalize(page)
    const bundlePath =
      AppRouteRouteDefinitionBuilder.normalizers.bundlePath.normalize(page)

    this.definitions.push({
      kind: RouteKind.APP_ROUTE,
      identity: pathname,
      bundlePath,
      filename,
      page,
      pathname,
    })
  }
}
