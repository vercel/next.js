import type { LocaleRouteDefinition } from '../route-definitions/locale-route-definition'
import type { LocaleRouteMatch } from '../route-matches/locale-route-match'
import type { PathnameMatcher } from './helpers/pathname-matcher'

import { createPathnameMatcher } from './helpers/create-pathname-matcher'
import { DynamicPathnameMatcher } from './helpers/dynamic-pathname-matcher'
import { RouteMatcher, RouteMatcherOptions } from './route-matcher'

type LocaleMatcherMatchOptions = RouteMatcherOptions

export class LocaleRouteMatcher<
  D extends LocaleRouteDefinition = LocaleRouteDefinition,
  M extends LocaleMatcherMatchOptions = LocaleMatcherMatchOptions
> extends RouteMatcher<D, M> {
  /**
   * is returns true if the given RouteMatcher is a LocaleRouteMatcher.
   *
   * @param m the RouteMatcher to check
   * @returns true if the given RouteMatcher is a LocaleRouteMatcher
   */
  public static is(
    m: RouteMatcher
  ): m is LocaleRouteMatcher<LocaleRouteDefinition, LocaleMatcherMatchOptions> {
    return m instanceof LocaleRouteMatcher
  }

  private readonly matcher: PathnameMatcher

  constructor(definition: D) {
    super(definition)
    this.matcher = createPathnameMatcher(definition.i18n.pathname)
  }

  /**
   * Identity returns the identity part of the matcher. This is used to compare
   * a unique matcher to another. This is also used when sorting dynamic routes,
   * so it must contain the pathname part as well.
   */
  public get identity(): string {
    return `${this.definition.i18n.pathname}?__nextLocale=${encodeURIComponent(
      this.definition.i18n.detectedLocale ?? ''
    )}`
  }

  public get isDynamic() {
    return this.matcher instanceof DynamicPathnameMatcher
  }

  /**
   * Match will attempt to match the given pathname against this route while
   * also taking into account the locale information.
   *
   * @param pathname The pathname to match against.
   * @param options The options to use when matching.
   * @returns The match result, or `null` if there was no match.
   */
  public match({ options: { i18n } }: M): LocaleRouteMatch<D> | null {
    // If we don't have any locale information, then this isn't a match! This
    // only happens when the matcher is used when locale matching information
    // was not provided.
    if (!i18n) {
      throw new Error(
        'Invariant: expected i18n to be provided to a locale route matcher'
      )
    }

    const { detectedLocale, inferredFromDefault = false, pathname } = i18n

    // If we have detected a locale and it does not match this route's locale,
    // then this isn't a match!
    if (
      this.definition.i18n.detectedLocale &&
      detectedLocale &&
      this.definition.i18n.detectedLocale !== detectedLocale
    ) {
      return null
    }

    const result = this.matcher.match(pathname)
    if (!result) return null

    if (detectedLocale) {
      return {
        definition: this.definition,
        params: result.params,
        i18n: {
          detectedLocale,
          inferredFromDefault,
          inferredFromDefinition: false,
        },
      }
    }

    return {
      definition: this.definition,
      params: result.params,
      i18n: {
        detectedLocale: this.definition.i18n.detectedLocale,
        inferredFromDefault: false,
        inferredFromDefinition: true,
      },
    }
  }
}
