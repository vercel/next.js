import { RouteKind } from '../route-kind'
import type { RouteMatch } from '../route-matches/route-match'
import type { RouteDefinition } from '../route-definitions/route-definition'
import { DefaultRouteMatcherManager } from './default-route-matcher-manager'
import type { MatchOptions, RouteMatcherManager } from './route-matcher-manager'
import path from '../../shared/lib/isomorphic/path'
import * as Log from '../../build/output/log'
import { cyan } from '../../lib/picocolors'
import type { RouteMatcher } from '../route-matchers/route-matcher'

export interface RouteEnsurer {
  ensure(match: RouteMatch, pathname: string): Promise<void>
}

export class DevRouteMatcherManager extends DefaultRouteMatcherManager {
  constructor(
    private readonly production: RouteMatcherManager,
    private readonly ensurer: RouteEnsurer,
    private readonly dir: string
  ) {
    super()
  }

  public async test(pathname: string, options: MatchOptions): Promise<boolean> {
    // Try to find a match within the developer routes. Unlike the
    // implementation of `match` which uses `matchAll` here, this does not
    // call `ensure` on the match found via the development matches.
    for await (const match of this.developmentMatchAll(pathname, options)) {
      if (match) return true
    }

    return false
  }

  protected validate(
    pathname: string,
    matcher: RouteMatcher,
    options: MatchOptions
  ): RouteMatch | null {
    const match = super.validate(pathname, matcher, options)

    // If a match was found, check to see if there were any conflicting app or
    // pages files.
    // TODO: maybe expand this to _any_ duplicated routes instead?
    if (
      match &&
      matcher.duplicated &&
      matcher.duplicated.some(
        (duplicate) =>
          duplicate.definition.kind === RouteKind.APP_PAGE ||
          duplicate.definition.kind === RouteKind.APP_ROUTE
      ) &&
      matcher.duplicated.some(
        (duplicate) =>
          duplicate.definition.kind === RouteKind.PAGES ||
          duplicate.definition.kind === RouteKind.PAGES_API
      )
    ) {
      return null
    }

    return match
  }

  /**
   * Iterates over the development matches for the request path. The
   * development matchers are reloaded when the file watcher has processed a
   * change, so they can lag behind the filesystem when a request arrives
   * right after a file was written. On a miss, this re-scans the filesystem
   * once and retries before treating the request path as unmatched.
   */
  private async *developmentMatchAll(
    pathname: string,
    options: MatchOptions
  ): AsyncGenerator<RouteMatch<RouteDefinition<RouteKind>>, null, undefined> {
    for (let attempt = 0; attempt < 2; attempt++) {
      let matched = false
      for await (const developmentMatch of super.matchAll(pathname, options)) {
        matched = true
        yield developmentMatch
      }

      if (matched || attempt === 1) break

      await super.reload()
    }

    return null
  }

  public async *matchAll(
    pathname: string,
    options: MatchOptions
  ): AsyncGenerator<RouteMatch<RouteDefinition<RouteKind>>, null, undefined> {
    // Iterate over the development matches to see if one of them match the
    // request path.
    for await (const developmentMatch of this.developmentMatchAll(
      pathname,
      options
    )) {
      // We're here, which means that we haven't seen this match yet, so we
      // should try to ensure it and recompile the production matcher.
      await this.ensurer.ensure(developmentMatch, pathname)
      await this.production.reload()

      // Iterate over the production matches again, this time we should be able
      // to match it against the production matcher unless there's an error.
      for await (const productionMatch of this.production.matchAll(
        pathname,
        options
      )) {
        yield productionMatch
      }
    }

    // We tried direct matching against the pathname and against all the dynamic
    // paths, so there was no match.
    return null
  }

  public async reload(): Promise<void> {
    // Compile the production routes again.
    await this.production.reload()

    // Compile the development routes.
    await super.reload()

    // Check for and warn of any duplicates.
    for (const [pathname, matchers] of Object.entries(
      this.matchers.duplicates
    )) {
      // We only want to warn about matchers resolving to the same path if their
      // identities are different.
      const identity = matchers[0].identity
      if (matchers.slice(1).some((matcher) => matcher.identity !== identity)) {
        continue
      }

      Log.warn(
        `Duplicate page detected. ${matchers
          .map((matcher) =>
            cyan(path.relative(this.dir, matcher.definition.filename))
          )
          .join(' and ')} resolve to ${cyan(pathname)}`
      )
    }
  }
}
