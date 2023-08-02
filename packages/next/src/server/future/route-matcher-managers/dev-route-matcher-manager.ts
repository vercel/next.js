import { RouteKind } from '../route-kind'
import { RouteMatch } from '../route-matches/route-match'
import { RouteDefinition } from '../route-definitions/route-definition'
import { MatchOptions, RouteMatcherManager } from './route-matcher-manager'

export class DevRouteMatcherManager {
  static wrap(manager: RouteMatcherManager): RouteMatcherManager {
    // We need to wrap the production matcher manager so that we can reload the
    // production matcher manager when we reload the dev matcher manager.
    const matchAll = manager.matchAll.bind(manager)
    manager.matchAll = async function* (
      pathname: string,
      options: MatchOptions
    ): AsyncGenerator<RouteMatch<RouteDefinition<RouteKind>>, null, undefined> {
      await manager.reload()

      // Iterate over the production matches. Now that we've reloaded we should
      // have the latest production matches.
      for await (const production of matchAll(pathname, options)) {
        yield production
      }

      // We tried direct matching against the pathname and against all the dynamic
      // paths, so there was no match.
      return null
    }

    return manager
  }
}
