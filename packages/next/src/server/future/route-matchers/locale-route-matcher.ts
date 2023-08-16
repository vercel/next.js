import type { LocaleAnalysisResult } from '../helpers/i18n-provider'
import type { LocaleRouteDefinition } from '../route-definitions/locale-route-definition'
import type { LocaleRouteMatch } from '../route-matches/locale-route-match'
import { RouteMatcher } from './route-matcher'

export type LocaleMatcherMatchOptions = {
  /**
   * If defined, this indicates to the matcher that the request should be
   * treated as locale-aware. If this is undefined, it means that this
   * application was not configured for additional locales.
   */
  i18n?: LocaleAnalysisResult
}

export class LocaleRouteMatcher<
  D extends LocaleRouteDefinition = LocaleRouteDefinition
> extends RouteMatcher<D> {
  /**
   * Identity returns the identity part of the matcher. This is used to compare
   * a unique matcher to another. This is also used when sorting dynamic routes,
   * so it must contain the pathname part as well.
   */
  public get identity(): string {
    return `${this.definition.pathname}?__nextLocale=${this.definition.i18n?.locale}`
  }

  /**
   * Match will attempt to match the given pathname against this route while
   * also taking into account the locale information.
   *
   * @param pathname The pathname to match against.
   * @param options The options to use when matching.
   * @returns The match result, or `null` if there was no match.
   */
  public match(
    pathname: string,
    options?: LocaleMatcherMatchOptions
  ): LocaleRouteMatch<D> | null {
    // This is like the parent `match` method but instead this injects the
    // additional `options` into the
    const result = this.test(pathname, options)
    if (!result) return null

    return {
      definition: this.definition,
      params: result.params,
      detectedLocale:
        // If the options have a detected locale, then use that, otherwise use
        // the route's locale.
        options?.i18n?.detectedLocale ?? this.definition.i18n?.locale,
    }
  }

  /**
   * Test will attempt to match the given pathname against this route while
   * also taking into account the locale information.
   *
   * @param pathname The pathname to match against.
   * @param options The options to use when matching.
   * @returns The match result, or `null` if there was no match.
   */
  public test(pathname: string, options?: LocaleMatcherMatchOptions) {
    // If this route has locale information and we have detected a locale, then
    // we need to compare the detected locale to the route's locale.
    if (this.definition.i18n && options?.i18n) {
      // If we have detected a locale and it does not match this route's locale,
      // then this isn't a match!
      if (
        this.definition.i18n.locale &&
        options.i18n.detectedLocale &&
        this.definition.i18n.locale !== options.i18n.detectedLocale
      ) {
        return null
      }

      // Perform regular matching against the locale stripped pathname now, the
      // locale information matches!
      return super.test(options.i18n.pathname)
    }

    // If we don't have locale information, then we can just perform regular
    // matching.
    return super.test(pathname)
  }
}
