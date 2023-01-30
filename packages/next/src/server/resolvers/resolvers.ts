import { BaseNextRequest } from '../base-http'
import { Route } from '../routes/route'
import { Resolver } from './resolver'

/**
 * Resolvers provides a single entrypoint to configuring all the available
 * resolvers for this application. It will try all the provided resolvers in
 * order until a single one is found.
 */
export class Resolvers implements Resolver<Route> {
  constructor(private readonly resolvers: ReadonlyArray<Resolver<Route>>) {}

  /**
   * Returns the route that should handle the request if any.
   *
   * @param req the request for which we should resolve the route for
   * @returns the route (if it exists) for the request
   */
  public async resolve(req: BaseNextRequest): Promise<Route | null> {
    // Loop over all the resolvers, find the one that matches this route.
    for (const resolver of this.resolvers) {
      const route = await resolver.resolve(req)
      if (!route) continue

      return route
    }

    // No route was found given the configured resolvers.
    return null
  }
}
