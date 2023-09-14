import type { InternalAppRouteDefinition } from '../internal-route-definition'

import { isInternalAppRoute } from '../../../../lib/is-internal-app-route'
import { AppBundlePathNormalizer } from '../../normalizers/built/app/app-bundle-path-normalizer'
import { AppPathnameNormalizer } from '../../normalizers/built/app/app-pathname-normalizer'
import { RouteKind } from '../../route-kind'
import { RouteDefinitionBuilder } from './route-definition-builder'

type InternalAppRouteDefinitionBuilderInput = Pick<
  InternalAppRouteDefinition,
  'page' | 'filename' | 'builtIn'
>

export class InternalAppRouteDefinitionBuilder extends RouteDefinitionBuilder<
  InternalAppRouteDefinition,
  InternalAppRouteDefinitionBuilderInput
> {
  private static readonly normalizers = {
    pathname: new AppPathnameNormalizer(),
    bundlePath: new AppBundlePathNormalizer(),
  }

  protected readonly definitions = new Array<InternalAppRouteDefinition>()

  protected sort(
    left: InternalAppRouteDefinition,
    right: InternalAppRouteDefinition
  ): number {
    // Always put built-in routes last.
    return right.builtIn === left.builtIn ? 0 : right.builtIn ? -1 : 1
  }

  public add({
    page,
    filename,
    builtIn,
  }: InternalAppRouteDefinitionBuilderInput): void {
    if (!isInternalAppRoute(page)) {
      throw new Error(`Invariant: page is not an app route: ${page}`)
    }

    const pathname =
      InternalAppRouteDefinitionBuilder.normalizers.pathname.normalize(page)
    const bundlePath =
      InternalAppRouteDefinitionBuilder.normalizers.bundlePath.normalize(page)

    this.definitions.push({
      kind: RouteKind.INTERNAL_APP,
      bundlePath,
      filename,
      page,
      pathname,
      builtIn,
    })
  }
}
