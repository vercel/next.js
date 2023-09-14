import type { RouteManager } from './route-manager'
import type { RouteDefinitionManager } from '../route-definitions/managers/route-definition-manager'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type {
  MatchOptions,
  RouteMatcherManager,
} from '../route-matchers/managers/route-matcher-manager'
import type { RouteMatch } from '../route-matches/route-match'
import type { RouteComponentsLoader } from '../route-components-loader/route-components-loader'
import type { RouteDefinitionFilterSpec } from '../route-definitions/providers/helpers/route-definition-filter'

import { BaseRouteManager } from './base-route-manager'
import { isBuiltInRouteDefinition } from '../route-definitions/internal-route-definition'

export interface RouteEnsurer {
  ensure(definition: RouteDefinition): Promise<void>
}

export class DevRouteManager extends BaseRouteManager implements RouteManager {
  constructor(
    private readonly production: RouteManager,
    private readonly ensurer: RouteEnsurer,
    componentsLoader: RouteComponentsLoader,
    definitions: RouteDefinitionManager,
    matchers: RouteMatcherManager
  ) {
    super(definitions, matchers, componentsLoader)
  }

  protected async loader(): Promise<void> {
    await this.definitions.forceReload()
    await this.matchers.forceReload()
    await this.production.forceReload()
  }

  private enhance<D extends RouteDefinition>(development: D, production: D): D {
    if (!isBuiltInRouteDefinition(development)) {
      return { ...production, development }
    }

    // If the development route is a built-in route, we need to ensure that the
    // production route is also a built-in route. We can't distinguish between
    // built-in and custom routes in the production routes, so we need to copy
    // the built-in flag from the development route.
    const { builtIn } = development

    return {
      ...production,
      builtIn,
      development,
    }
  }

  public async findDefinition<D extends RouteDefinition>(
    ...specs: RouteDefinitionFilterSpec<D>[]
  ): Promise<D | null> {
    // For each spec,
    for (const spec of specs) {
      // Try to find the route in the development routes as it's the source of
      // truth. If we can't find it here, we can't find it in the production
      // definitions either.
      const development = await this.definitions.find<D>(spec)
      if (!development) continue

      // We found the definition in the development routes, let's check to see
      // if it exists in the production routes.
      let production = await this.production.findDefinition<D>(spec)

      // If the production route exists, we can return it now.
      if (production) return this.enhance(development, production)

      // The production route does not exist, so we need to ensure that it does.
      await this.ensurer.ensure(development)

      // Now that we've ensured the route, we can reload the production routes
      // and try to find the route again.
      await this.production.forceReload()

      // Try to find the route in the production routes again.
      production = await this.production.findDefinition<D>(spec)
      if (!production) {
        // We found a development route, but after ensuring it we still couldn't
        // find a production route. This is an error.
        throw new Error(
          `Invariant: expected production route to exist after ensuring it`
        )
      }

      // If the production route exists, we can return it now.
      return this.enhance(development, production)
    }

    // We couldn't find the route in the development routes, so we can't find it
    // in the production routes either.
    return null
  }

  public async *matchAll(
    pathname: string,
    options: MatchOptions
  ): AsyncGenerator<RouteMatch, void, void> {
    const seen = new Set<string>()

    // Try to find the route in the development routes as it's the source of
    // truth. If we can't find it here, we can't find it in the production
    // definitions either.
    for await (const development of this.matchers.matchAll(pathname, options)) {
      // We found a development route, let's ensure it to validate that it
      // exists in the production routes and then reload them.
      await this.ensurer.ensure(development.definition)
      await this.production.forceReload()

      // Find the production route that matches the development route.
      const definition = await this.production.findDefinition({
        pathname: development.definition.pathname,
      })
      if (!definition) {
        throw new Error(
          `Invariant: expected production route to exist after ensuring it`
        )
      }

      // Ensure that the options are requesting the specific route that we
      // found.
      options = {
        ...options,
        pathname: definition.pathname,
      }

      // Try to find the route in the production routes.
      for await (const production of this.production.matchAll(
        pathname,
        options
      )) {
        // If we've already seen this production route, skip it. It means we've
        // already yielded it.
        if (seen.has(production.definition.pathname)) {
          throw new Error(
            `Invariant: expected production route to be unique, but found duplicate`
          )
        }

        // We found a production route, so yield it and exit.
        yield production

        // Mark this production route as seen so we don't yield it again.
        seen.add(production.definition.pathname)
      }
    }
  }
}
