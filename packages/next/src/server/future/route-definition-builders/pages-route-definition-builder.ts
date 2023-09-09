import type {
  PagesLocaleRouteDefinition,
  PagesRouteDefinition,
} from '../route-definitions/pages-route-definition'

import { PagesBundlePathNormalizer } from '../normalizers/built/pages/pages-bundle-path-normalizer'
import { RouteDefinitionBuilder } from './route-definition-builder'
import { RouteKind } from '../route-kind'
import { LocaleAnalysisResult } from '../helpers/i18n-provider'

type PagesRouteDefinitionBuilderInput = Pick<
  PagesRouteDefinition | PagesLocaleRouteDefinition,
  'page' | 'filename' | 'pathname'
> & {
  localeInfo: LocaleAnalysisResult | undefined
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
        pathname,
        page,
        bundlePath,
        filename,
        i18n: { locale: localeInfo.detectedLocale },
      })
    } else {
      this.definitions.push({
        kind: RouteKind.PAGES,
        page,
        pathname,
        bundlePath,
        filename,
      })
    }
  }
}
