import type { PagesAPIRouteDefinition } from '../pages-api-route-definition'

import { PagesBundlePathNormalizer } from '../../normalizers/built/pages/pages-bundle-path-normalizer'
import { RouteDefinitionBuilder } from './route-definition-builder'
import { RouteKind } from '../../route-kind'

type PagesAPIRouteDefinitionBuilderInput = Pick<
  PagesAPIRouteDefinition,
  'page' | 'filename'
>

export class PagesAPIRouteDefinitionBuilder extends RouteDefinitionBuilder<
  PagesAPIRouteDefinition,
  PagesAPIRouteDefinitionBuilderInput
> {
  private static readonly normalizers = {
    bundlePath: new PagesBundlePathNormalizer(),
  }

  protected definitions = new Array<PagesAPIRouteDefinition>()

  public add({ page, filename }: PagesAPIRouteDefinitionBuilderInput) {
    const bundlePath =
      PagesAPIRouteDefinitionBuilder.normalizers.bundlePath.normalize(page)

    this.definitions.push({
      kind: RouteKind.PAGES_API,
      page,
      // For API routes, the page is the pathname.
      pathname: page,
      identity: page,
      bundlePath,
      filename,
    })
  }
}
