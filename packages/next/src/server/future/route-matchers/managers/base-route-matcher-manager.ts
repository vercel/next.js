import type { RouteMatcherProvider } from '../providers/route-matcher-provider'
import type { RouteMatch } from '../../route-matches/route-match'
import type { RouteMatcher } from '../route-matcher'
import type { MatchOptions, RouteMatcherManager } from './route-matcher-manager'
import type { Normalizer } from '../../normalizers/normalizer'

import { isDynamicRoute } from '../../../../shared/lib/router/utils'
import { LocaleRouteMatcher } from '../locale-route-matcher'
import {
  MatchOptionsNormalizer,
  NormalizedMatchOptions,
} from '../../normalizers/match-options-normalizer'
import { groupMatcherResults } from './helpers/group-matcher-results'
import { sortDynamicMatchers } from './helpers/sort-dynamic-matchers'
import { BaseLoadable } from '../../helpers/loadable/base-loadable'
import { PagesLocaleRouteDefinition } from '../../route-definitions/pages-route-definition'

type RouteMatchers = {
  /**
   * The static matchers. These are not dynamic, and therefore are not sorted.
   * We can't rely on a map lookup because these routes may have other matching
   * characteristics (like the locale) that is considered.
   */
  static: ReadonlyArray<RouteMatcher>

  /**
   * The dynamic matchers, sorted by the order they should be matched in.
   */
  dynamic: ReadonlyArray<RouteMatcher>

  /**
   * A map of all the matchers, keyed by the pathname of the definition. This
   * is used to match against a specific definition pathname when a specific
   * output is requested.
   */
  all: ReadonlyMap<string, ReadonlyArray<RouteMatcher>>
}

export class BaseRouteMatcherManager
  extends BaseLoadable
  implements RouteMatcherManager
{
  /**
   * The providers that will be used to get the matchers.
   */
  private readonly providers: Array<RouteMatcherProvider> = []

  /**
   * The matchers that have been loaded.
   */
  protected readonly matchers: RouteMatchers = {
    static: [],
    dynamic: [],
    all: new Map(),
  }

  /**
   * The last compilation ID that was used to compile the matchers. This is used
   * to ensure that the matchers are compiled before they are used.
   */
  private lastCompilationID = this.compilationID

  /**
   * The normalizer to use for normalizing the match options. In the future this
   * may be injected rather than hard coded.
   */
  private readonly normalizer: Normalizer<NormalizedMatchOptions> =
    new MatchOptionsNormalizer()

  /**
   * When this value changes, it indicates that a change has been introduced
   * that requires recompilation.
   */
  private get compilationID() {
    return this.providers.length
  }

  /**
   * The reference to the previous matchers. This is used to determine if the
   * matchers have changed between reloads (i.e., if a matcher doesn't exactly
   * match the previous matcher, it's considered a new matcher).
   */
  private previousMatchers: ReadonlyArray<RouteMatcher> = []
  public async loader() {
    // Grab the compilation ID for this run, we'll verify it at the end to
    // ensure that if any routes were added before reloading is finished that
    // we error out.
    const compilationID = this.compilationID

    try {
      // Get all the providers matchers.
      const providersMatchers: ReadonlyArray<ReadonlyArray<RouteMatcher>> =
        await Promise.all(this.providers.map((provider) => provider.provide()))

      // Flatten the matchers into a single array.
      const matchers: ReadonlyArray<RouteMatcher> = providersMatchers.flat()

      // If the cache is the same as what we just parsed, we can exit now. We
      // can tell by using the `===` which compares object identity, which for
      // the manifest matchers, will return the same matcher each time.
      if (
        this.previousMatchers.length === matchers.length &&
        this.previousMatchers.every(
          (cachedMatcher, index) => cachedMatcher === matchers[index]
        )
      ) {
        return
      }
      this.previousMatchers = matchers
      // Update the matcher outputs reference.
      this.matchers.all = groupMatcherResults(matchers)

      // For matchers that are for static routes, filter them now.
      this.matchers.static = matchers.filter((matcher) => !matcher.isDynamic)

      // For matchers that are for dynamic routes, filter them and sort them
      // now.
      this.matchers.dynamic = sortDynamicMatchers(
        matchers.filter((matcher) => matcher.isDynamic)
      )

      // This means that there was a new matcher pushed while we were waiting
      if (this.compilationID !== compilationID) {
        throw new Error(
          'Invariant: expected compilation to finish before new matchers were added, possible missing await'
        )
      }
    } catch (err) {
      throw err
    } finally {
      // The compilation ID matched, so mark the complication as finished.
      this.lastCompilationID = compilationID
    }
  }

  public add(provider: RouteMatcherProvider): void {
    this.providers.push(provider)

    // Reset the loaded state so that the matchers are reloaded if load has
    // already been called.
    this.invalidate()
  }

  /**
   * This is a point for other managers to override to inject other checking
   * behavior like duplicate route checking on a per-request basis.
   *
   * @param pathname the pathname to validate against
   * @param matcher the matcher to validate/test with
   * @returns the match if found
   */
  protected validate(
    matcher: RouteMatcher,
    normalized: NormalizedMatchOptions
  ): RouteMatch | null {
    if (LocaleRouteMatcher.is<PagesLocaleRouteDefinition>(matcher)) {
      if (!normalized.options.i18n) {
        throw new Error(
          'Invariant: expected locale matcher to have locale information for matching'
        )
      }

      return matcher.match(normalized.options.i18n)
    }

    // If the locale was inferred from the default locale, then it will have
    // already added a locale to the pathname. We need to remove it before
    // matching because this matcher is not locale aware.
    if (normalized.options.i18n?.inferredFromDefault) {
      return matcher.match({ pathname: normalized.options.i18n.pathname })
    }

    return matcher.match(normalized)
  }

  public async match(
    pathname: string,
    info: MatchOptions
  ): Promise<RouteMatch | null> {
    // "Iterate" over the match options. Once we found a single match, exit with
    // it, otherwise return null below. If no match is found, the inner block
    // won't be called.
    for await (const match of this.matchAll(pathname, info)) {
      return match
    }

    return null
  }

  public async *matchAll(
    pathname: string,
    options: MatchOptions
  ): AsyncGenerator<RouteMatch, void, void> {
    // Guard against the matcher manager from being run before it needs to be
    // recompiled. This was preferred to re-running the compilation here because
    // it should be re-ran only when it changes. If a match is attempted before
    // this is done, it indicates that there is a case where a provider is added
    // before it was recompiled (an error). We also don't want to affect request
    // times.
    if (this.lastCompilationID !== this.compilationID) {
      throw new Error(
        'Invariant: expected routes to have been loaded before match'
      )
    }

    // Normalize the pathname and options.
    const normalized = this.normalizer.normalize({ pathname, options })

    // If a definition pathname was provided, get the match for it, and only it.
    if (normalized.options.pathname) {
      // Get the matcher for the definition pathname.
      const matchers = this.matchers.all.get(normalized.options.pathname)

      // There was no matchers for this output.
      if (!matchers) return

      // Loop over the matchers, yielding the first match, it should only match
      // once.
      for (const matcher of matchers) {
        const match = this.validate(matcher, normalized)
        if (!match) continue

        // We found a match, so yield it and exit.
        yield match

        return
      }

      // We didn't find a match, so exit.
      return
    }

    // If this pathname looks like a dynamic route, then we couldn't have a
    // static match for it because you can't escape the dynamic route parameters
    // when creating the page. So we can skip the static matchers.
    if (!isDynamicRoute(pathname)) {
      for (const matcher of this.matchers.static) {
        const match = this.validate(matcher, normalized)
        if (!match) continue

        yield match
      }
    }

    // Loop over the dynamic matchers, yielding each match.
    for (const matcher of this.matchers.dynamic) {
      const match = this.validate(matcher, normalized)
      if (!match) continue

      yield match
    }

    return
  }
}
