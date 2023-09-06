import type { LocaleInfo } from '../helpers/i18n-provider'

import { RouteMatch } from '../route-matches/route-match'
import { RouteMatcherProvider } from '../route-matcher-providers/route-matcher-provider'

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
  matchedOutputPathname: string | undefined
}

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
  push(...provider: ReadonlyArray<RouteMatcherProvider>): void

  /**
   * Loads the matchers from the providers. This should be done after all the
   * providers have been added. Calls after the first call will be ignored.
   */
  load(): Promise<void>

  /**
   * Forces a reload of the matchers from the providers. This should be done
   * after all the providers have been added or the underlying providers should
   * be refreshed. This should only be used in development or testing
   * environments.
   *
   * This will not force a reload of the underlying providers, their internal
   * cache will be used if they have already been loaded.
   */
  forceReload(): Promise<void>

  /**
   * Returns the first match for a given request.
   *
   * @param pathname the pathname to match against
   * @param options the options for the matching
   */
  match(
    pathname: string,
    options: MatchOptions
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
  ): AsyncGenerator<Readonly<RouteMatch>, null, undefined>
}
