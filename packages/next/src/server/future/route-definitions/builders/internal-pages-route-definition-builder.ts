import type { LocaleInfo } from '../../helpers/i18n-provider'
import type {
  InternalLocalePagesRouteDefinition,
  InternalPagesRouteDefinition,
} from '../internal-route-definition'

import { isInternalPagesRoute } from '../../../../lib/is-internal-pages-route'
import { RouteKind } from '../../route-kind'
import { BuiltInRouteDefinitionBuilder } from './built-in-route-definition-builder'
import { PagesBundlePathNormalizer } from '../../normalizers/built/pages/pages-bundle-path-normalizer'

type InternalPagesRouteDefinitionBuilderInput = Pick<
  InternalPagesRouteDefinition | InternalLocalePagesRouteDefinition,
  'page' | 'filename' | 'builtIn'
> & {
  localeInfo: LocaleInfo | undefined
}

export class InternalPagesRouteDefinitionBuilder extends BuiltInRouteDefinitionBuilder<
  InternalPagesRouteDefinition | InternalLocalePagesRouteDefinition,
  InternalPagesRouteDefinitionBuilderInput
> {
  private static readonly normalizers = {
    bundlePath: new PagesBundlePathNormalizer(),
  }

  protected readonly definitions = new Array<
    InternalPagesRouteDefinition | InternalLocalePagesRouteDefinition
  >()

  public add({
    page,
    filename,
    builtIn,
    localeInfo,
  }: InternalPagesRouteDefinitionBuilderInput): void {
    if (
      localeInfo
        ? !isInternalPagesRoute(localeInfo.pathname)
        : !isInternalPagesRoute(page)
    ) {
      throw new Error(`Invariant: page is not an internal pages route: ${page}`)
    }

    const bundlePath =
      InternalPagesRouteDefinitionBuilder.normalizers.bundlePath.normalize(page)

    if (localeInfo) {
      this.definitions.push({
        kind: RouteKind.INTERNAL_PAGES,
        bundlePath,
        filename,
        page,
        pathname: localeInfo.pathname,
        builtIn,
        i18n: {
          detectedLocale: localeInfo.detectedLocale,
          pathname: localeInfo.pathname,
        },
      })
    } else {
      this.definitions.push({
        kind: RouteKind.INTERNAL_PAGES,
        bundlePath,
        filename,
        page,
        pathname: page,
        builtIn,
      })
    }
  }
}
