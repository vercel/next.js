import type { NormalizedMatchOptions } from '../normalizers/match-options-normalizer'
import type { RouteMatch } from '../route-matches/route-match'
import type { MatchOptions, RouteMatcherManager } from './route-matcher-manager'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type { RouteMatcher } from '../route-matchers/route-matcher'

import { RouteKind } from '../route-kind'
import { DefaultRouteMatcherManager } from './default-route-matcher-manager'
import path from '../../../shared/lib/isomorphic/path'
import * as Log from '../../../build/output/log'
import chalk from 'next/dist/compiled/chalk'

export interface RouteEnsurer {
  ensure(match: RouteMatch): Promise<void>
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
    // Try to find a match within the developer routes.
    const match = await super.match(pathname, options)

    // Return if the match wasn't null. Unlike the implementation of `match`
    // which uses `matchAll` here, this does not call `ensure` on the match
    // found via the development matches.
    return match !== null
  }

  protected validate(
    matcher: RouteMatcher,
    options: NormalizedMatchOptions
  ): RouteMatch | null {
    const match = super.validate(matcher, options)

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

  public async *matchAll(
    pathname: string,
    options: MatchOptions
  ): AsyncGenerator<RouteMatch<RouteDefinition<RouteKind>>, null, undefined> {
    // Compile the development routes.
    // TODO: we may want to only run this during testing, users won't be fast enough to require this many dir scans
    await super.forceReload()

    // Iterate over the development matches to see if one of them match the
    // request path.
    for await (const development of super.matchAll(pathname, options)) {
      // We're here, which means that we haven't seen this match yet, so we
      // should try to ensure it and recompile the production matcher.
      await this.ensurer.ensure(development)
      await this.production.forceReload()

      // Iterate over the production matches again, this time we should be able
      // to match it against the production matcher unless there's an error.
      for await (const production of this.production.matchAll(
        pathname,
        options
      )) {
        yield production
      }
    }

    // We tried direct matching against the pathname and against all the dynamic
    // paths, so there was no match.
    return null
  }

  public async load(): Promise<void> {
    // Load both the production and development routes.
    await Promise.all([this.production.load(), super.load()])
  }

  public async forceReload(): Promise<void> {
    // Load both the production and development routes.
    await Promise.all([this.production.forceReload(), super.forceReload()])

    // Check for and warn of any duplicates.
    for (const [pathname, matchers] of this.matchers.duplicates.entries()) {
      // We only want to warn about matchers resolving to the same path if their
      // identities are different.
      const identity = matchers[0].identity
      if (matchers.slice(1).some((matcher) => matcher.identity !== identity)) {
        continue
      }

      Log.warn(
        `Duplicate page detected. ${matchers
          .map((matcher) =>
            chalk.cyan(path.relative(this.dir, matcher.definition.filename))
          )
          .join(' and ')} resolve to ${chalk.cyan(pathname)}`
      )
    }
  }
}
