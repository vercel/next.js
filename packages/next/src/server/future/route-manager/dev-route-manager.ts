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
import { FileType, fileExists } from '../../../lib/file-exists'
import { PageNotFoundError } from '../../../shared/lib/utils'
import { wait } from '../../../lib/wait'

export interface RouteEnsurer {
  ensure(definition: RouteDefinition): Promise<void>
}

export class DevRouteManager extends BaseRouteManager implements RouteManager {
  constructor(
    private readonly production: RouteManager,
    private readonly ensurer: RouteEnsurer,
    componentsLoader: RouteComponentsLoader,
    definitions: RouteDefinitionManager,
    matchers: RouteMatcherManager,
    private readonly retryMaxAttempts = 2,
    private readonly retryDelay = 100
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

  /**
   * Returns true if a route definition exists that matches one of the given
   * specifications. This doesn't ensure the definitions, it will only check
   * the development definitions.
   *
   * @param specs The specification to match.
   */
  public hasDefinition<D extends RouteDefinition>(
    ...specs: Partial<D>[]
  ): Promise<boolean> {
    return this.definitions.has(...specs)
  }

  /**
   * Ensures that the definition after validating that the file exists. If the
   * file doesn't exist, it will return false.
   *
   * @param definition
   * @returns
   */
  private async ensureDefinition<D extends RouteDefinition>(
    definition: D
  ): Promise<boolean> {
    // Let's validate if that file actually exists still.
    const exists = await fileExists(definition.filename, FileType.File)
    if (!exists) return false

    try {
      this.debug('ensuring route: %s', definition.pathname)

      // Let's ensure that the definition exists in the production routes.
      await this.ensurer.ensure(definition)
    } catch (err) {
      // If the error is a page not found error, we can return false.
      if (err instanceof PageNotFoundError) return false

      // Otherwise, we need to throw the error.
      throw err
    }

    // Now that we've ensured the route, we can reload the production routes.
    await this.production.forceReload()

    // We were able to ensure the definition, so we can return true.
    return true
  }

  public async findDefinition<D extends RouteDefinition>(
    ...specs: RouteDefinitionFilterSpec<D>[]
  ): Promise<D | null> {
    // We don't want to keep trying to find the route in the development routes
    // forever, so let's only try a few times.
    let remainingAttempts = this.retryMaxAttempts

    // For each spec,..
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i]

      // Try to find the route in the development routes as it's the source of
      // truth. If we can't find it here, we can't find it in the production
      // definitions either.
      const development = await this.definitions.find<D>(spec)
      if (!development) continue

      // Let's validate if that file actually exists still.
      let exists = await fileExists(development.filename, FileType.File)

      // If the file doesn't exist, we can't find the route in the using the
      // development routes. We can't find it in the production routes either.
      if (!exists) {
        this.debug('file does not exist: %s', development.filename)

        // If we've tried this already a few times, we should give up.
        if (remainingAttempts <= 0) {
          this.debug('giving up after %d attempts', this.retryMaxAttempts)
          return null
        }

        // This also means that the development definitions are out of date, so
        // we need to reload them.
        await this.definitions.forceReload()

        // Decrement the remaining attempts and try again.
        remainingAttempts--
        i--

        this.debug('retrying after %dms', this.retryDelay)

        // Wait 100ms before trying again.
        await wait(this.retryDelay)

        continue
      }

      this.debug('development file exists: %s', development.filename)

      // We found the definition in the development routes, let's check to see
      // if it exists in the production routes.
      let production = await this.production.findDefinition<D>(spec)

      // If the production route exists, we can return it so long as we're sure
      // that it exists.
      if (production) {
        this.debug('production route match: %s', production.pathname)

        // Check if the file exists.
        exists = await fileExists(production.filename, FileType.File)

        // If the file does, we can return the production route.
        if (exists) {
          this.debug('production file exists: %s', production.filename)
          return this.enhance(development, production)
        }

        this.debug('production file does not exist: %s', production.filename)

        // The file doesn't exist, so we need to ensure that it does.
        production = null
      }

      // The production route does not exist, so we need to ensure that it does.
      exists = await this.ensureDefinition(development)

      // If the route doesn't exist, we can't find it in the production routes
      if (!exists) {
        this.debug(
          'production route does not exist after ensuring: %s',
          development.pathname
        )
        continue
      }

      // Try to find the route in the production routes again.
      production = await this.production.findDefinition<D>(spec)
      if (!production) {
        // We found a development route, but after ensuring it we still couldn't
        // find a production route. This is an error.
        throw new Error(
          `Invariant: expected production route to exist after ensuring it`
        )
      }

      this.debug(
        'production route match after ensuring: %s',
        production.pathname
      )

      // If the production route exists, we can return it now.
      return this.enhance(development, production)
    }

    this.debug('no route found')

    // We couldn't find the route in the development routes, so we can't find it
    // in the production routes either.
    return null
  }

  public async *matchAll(
    pathname: string,
    options: MatchOptions
  ): AsyncGenerator<RouteMatch, void, void> {
    this.debug('matching all: %s', pathname)

    const seen = new Set<RouteDefinition>()

    // Try to find the route in the development routes as it's the source of
    // truth. If we can't find it here, we can't find it in the production
    // definitions either.
    for await (const development of this.matchers.matchAll(pathname, options)) {
      this.debug('matched development: %s', development.definition.page)

      // We found a development route, let's ensure it to validate that it
      // exists in the production routes and then reload them.
      const exists = await this.ensureDefinition(development.definition)
      if (!exists) continue

      // Find the production route that matches the development route. This
      // isn't technically necessary, but it ensures that the production route
      // is loaded and ready to go.
      const definition = await this.production.findDefinition({
        pathname: development.definition.pathname,
      })
      if (!definition) {
        throw new Error(
          `Invariant: expected production route to exist after ensuring it`
        )
      }

      // Try to find the route in the production routes.
      for await (const production of this.production.matchAll(pathname, {
        ...options,
        // Ensure that the options are requesting the specific route that we
        // found.
        pathname: development.definition.pathname,
      })) {
        // If we've already seen this production route, skip it. It means we've
        // already yielded it.
        if (seen.has(production.definition)) {
          throw new Error(
            `Invariant: expected production route to be unique, but found duplicate`
          )
        }

        this.debug('matched production: %s', production.definition.page)

        // We found a production route, so yield it and exit.
        yield production

        // Mark this production route as seen so we don't yield it again.
        seen.add(production.definition)
      }
    }
  }
}
