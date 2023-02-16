import { LocaleRouteDefinition } from '../route-definitions/locale-route-definition'
import { LocaleRouteMatch } from '../route-matches/locale-route-match'
import { RouteMatcher } from './route-matcher'

export type LocaleMatcherMatchOptions = {
  /**
   * If defined, this indicates to the matcher that the request should be
   * treated as locale-aware. If this is undefined, it means that this
   * application was not configured for additional locales.
   */
  i18n?: {
    /**
     * The locale that was detected on the incoming route. If undefined it means
     * that the locale should be considered to be the default one.
     */
    detectedLocale?: string

    /**
     * The pathname that has had it's locale information stripped from.
     */
    pathname: string
  }
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
        options?.i18n?.detectedLocale ?? this.definition.i18n?.locale,
    }
  }

  public test(pathname: string, options?: LocaleMatcherMatchOptions) {
    // If this route has locale information...
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

    return super.test(pathname)
  }
}
