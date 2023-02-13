import { RouteMatch } from '../route-matches/route-match'
import { RouteMatcherProvider } from '../route-matcher-providers/route-matcher-provider'
import { LocaleMatcherMatchOptions } from '../route-matchers/locale-route-matcher'

export type MatchOptions = { skipDynamic?: boolean } & LocaleMatcherMatchOptions

export interface RouteMatcherManager {
  /**
   * Returns a promise that resolves when the matcher manager has finished
   * reloading.
   */
  waitTillReady(): Promise<void>

  /**
   * Pushes in a new matcher for this manager to manage. After all the
   * providers have been pushed, the manager must be reloaded.
   *
   * @param provider the provider for this manager to also manage
   */
  push(provider: RouteMatcherProvider): void

  /**
   * Reloads the matchers from the providers. This should be done after all the
   * providers have been added or the underlying providers should be refreshed.
   */
  reload(): Promise<void>

  /**
   * Tests the underlying matchers to find a match. It does not return the
   * match.
   *
   * @param pathname the pathname to test for matches
   * @param options the options for the testing
   */
  test(pathname: string, options: MatchOptions): Promise<boolean>

  /**
   * Returns the first match for a given request.
   *
   * @param pathname the pathname to match against
   * @param options the options for the matching
   */
  match(pathname: string, options: MatchOptions): Promise<RouteMatch | null>

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
  ): AsyncGenerator<RouteMatch, null, undefined>
}
