import type { LocaleInfo } from '../../helpers/i18n-provider'
import type { Loadable } from '../../helpers/loadable/loadable'
import type { RouteMatch } from '../../route-matches/route-match'

export type MatchOptions = {
  /**
   * If defined, this indicates to the matcher that the request should be
   * treated as locale-aware. If this is undefined, it means that this
   * application was not configured for additional locales.
   */
  i18n: Readonly<LocaleInfo> | undefined

  /**
   * The output of the matcher that should be used for matching. When defined,
   * it will only match with the matchers that share the same output. Variants
   * like different locales will be matched in order to match the correct
   * output.
   */
  pathname: string | undefined
}

export interface RouteMatcherManager extends Loadable {
  /**
   * Returns the first match for a given request.
   *
   * @param pathname the pathname to match against
   * @param definition the options for the matching
   */
  match(
    pathname: string,
    definition: MatchOptions
  ): Promise<Readonly<RouteMatch> | null>

  /**
   * Returns a generator for each match for a given request. This should be
   * consumed in a `for await (...)` loop, when finished, breaking or returning
   * from the loop will terminate the matching operation.
   *
   * @param pathname the pathname to match against
   * @param options the options for the matching
   */
  matchAll(
    pathname: string,
    options: MatchOptions
  ): AsyncGenerator<Readonly<RouteMatch>, void, void>
}
