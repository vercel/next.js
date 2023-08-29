import type { LocaleAnalysisResult } from '../helpers/i18n-provider'

import { RouteMatch } from '../route-matches/route-match'
import { RouteMatcherProvider } from '../route-matcher-providers/route-matcher-provider'

export type MatchOptions = {
  /**
   * If defined, this indicates to the matcher that the request should be
   * treated as locale-aware. If this is undefined, it means that this
   * application was not configured for additional locales.
   */
  i18n?: LocaleAnalysisResult | undefined

  /**
   * The pathname of the route definition to match against. If this is provided
   * then the matcher will only match against this route definition.
   */
  definitionPathname?: string
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
  push(...provider: RouteMatcherProvider[]): void

  /**
   * Loads the matchers from the providers. This should be done after all the
   * providers have been added.
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
