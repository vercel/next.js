import type {
  PagesLocaleRouteDefinition,
  PagesRouteDefinition,
} from '../pages-route-definition'
import type { LocaleInfo } from '../../helpers/i18n-provider'

import { PagesBundlePathNormalizer } from '../../normalizers/built/pages/pages-bundle-path-normalizer'
import { RouteDefinitionBuilder } from './route-definition-builder'
import { RouteKind } from '../../route-kind'
import { createIdentity } from './helpers/create-identity'

type PagesRouteDefinitionBuilderInput = Pick<
  PagesRouteDefinition | PagesLocaleRouteDefinition,
  'page' | 'filename' | 'pathname'
> & {
  localeInfo: LocaleInfo | undefined
}

export class PagesRouteDefinitionBuilder extends RouteDefinitionBuilder<
  PagesRouteDefinition | PagesLocaleRouteDefinition,
  PagesRouteDefinitionBuilderInput
> {
  private static readonly normalizers = {
    bundlePath: new PagesBundlePathNormalizer(),
  }

  public add({
    page,
    filename,
    pathname,
    localeInfo,
  }: PagesRouteDefinitionBuilderInput) {
    const bundlePath =
      PagesRouteDefinitionBuilder.normalizers.bundlePath.normalize(page)

    if (localeInfo) {
      this.definitions.push({
        kind: RouteKind.PAGES,
        identity: createIdentity(localeInfo.pathname, {
          locale: localeInfo.detectedLocale,
        }),
        pathname,
        page,
        bundlePath,
        filename,
        i18n: { detectedLocale: localeInfo.detectedLocale, pathname },
      })
    } else {
      this.definitions.push({
        kind: RouteKind.PAGES,
        identity: pathname,
        page,
        pathname,
        bundlePath,
        filename,
      })
    }
  }
}
