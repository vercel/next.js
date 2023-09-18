import type { InternalAppRouteDefinition } from '../internal-route-definition'

import { isInternalAppRoute } from '../../../../lib/is-internal-app-route'
import { AppBundlePathNormalizer } from '../../normalizers/built/app/app-bundle-path-normalizer'
import { AppPathnameNormalizer } from '../../normalizers/built/app/app-pathname-normalizer'
import { RouteKind } from '../../route-kind'
import { BuiltInRouteDefinitionBuilder } from './built-in-route-definition-builder'

type InternalAppRouteDefinitionBuilderInput = Pick<
  InternalAppRouteDefinition,
  'page' | 'filename' | 'builtIn'
>

export class InternalAppRouteDefinitionBuilder extends BuiltInRouteDefinitionBuilder<
  InternalAppRouteDefinition,
  InternalAppRouteDefinitionBuilderInput
> {
  private static readonly normalizers = {
    pathname: new AppPathnameNormalizer(),
    bundlePath: new AppBundlePathNormalizer(),
  }

  protected readonly definitions = new Array<InternalAppRouteDefinition>()

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
      identity: pathname,
      kind: RouteKind.INTERNAL_APP,
      bundlePath,
      filename,
      page,
      pathname,
      builtIn,
    })
  }
}
