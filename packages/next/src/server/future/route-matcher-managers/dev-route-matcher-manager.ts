import { RouteKind } from '../route-kind'
import { RouteMatch } from '../route-matches/route-match'
import { RouteDefinition } from '../route-definitions/route-definition'
import { DefaultRouteMatcherManager } from './default-route-matcher-manager'
import { MatchOptions, RouteMatcherManager } from './route-matcher-manager'
import path from '../../../shared/lib/isomorphic/path'
import { warn } from '../../../build/output/log'
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

  public async test(
    pathname: string,
    options?: MatchOptions
  ): Promise<boolean> {
    // Try to find a match within the developer routes.
    const match = await super.match(pathname, options)

    // Return if the match wasn't null. Unlike the implementation of `match`
    // which uses `matchAll` here, this does not call `ensure` on the match
    // found via the development matches.
    return match !== null
  }

  public async *matchAll(
    pathname: string,
    options?: MatchOptions
  ): AsyncGenerator<RouteMatch<RouteDefinition<RouteKind>>, null, undefined> {
    // Keep track of all the matches we've made.
    const matches = new Set<string>()

    // Iterate over the development matches to see if one of them match the
    // request path.
    for await (const development of super.matchAll(pathname, options)) {
      // There was a development match! Let's check to see if we've already
      // matched this one already (verified by comparing the bundlePath).
      if (matches.has(development.route.bundlePath)) continue

      // We're here, which means that we haven't seen this match yet, so we
      // should try to ensure it and recompile the production matcher.
      await this.ensurer.ensure(development)
      await this.production.reload()

      // Iterate over the production matches again, this time we should be able
      // to match it against the production matcher.
      let matchedProduction = false
      for await (const production of this.production.matchAll(
        pathname,
        options
      )) {
        // We found a matching production match! It may have already been seen
        // though, so let's skip if we have.
        if (matches.has(production.route.bundlePath)) continue

        // Mark that we've matched in production.
        matchedProduction = true

        // We found a matching production match! Add the match to the set of
        // matches and yield this match to be used.
        matches.add(production.route.bundlePath)
        yield production
      }

      if (!matchedProduction) {
        throw new Error(
          'Invariant: development match was found, but not found after ensuring'
        )
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
      warn(
        `Duplicate page detected. ${matchers
          .map((matcher) =>
            chalk.cyan(path.relative(this.dir, matcher.route.filename))
          )
          .join(' and ')} resolve to ${chalk.cyan(pathname)}.`
      )
    }
  }
}
