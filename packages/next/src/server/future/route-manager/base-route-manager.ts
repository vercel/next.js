import type { RouteDefinitionManager } from '../route-definitions/managers/route-definition-manager'
import type { RouteDefinition } from '../route-definitions/route-definition'
import type {
  MatchOptions,
  RouteMatcherManager,
} from '../route-matchers/managers/route-matcher-manager'
import type { RouteManager } from './route-manager'
import type { RouteMatch } from '../route-matches/route-match'
import type { LoadComponentsReturnType } from '../../load-components'
import type { RouteComponentsLoader } from '../route-components-loader/route-components-loader'
import type { RouteDefinitionFilterSpec } from '../route-definitions/providers/helpers/route-definition-filter'

import { BaseLoadable } from '../helpers/loadable/base-loadable'
import { RouteKind } from '../route-kind'

export class BaseRouteManager extends BaseLoadable implements RouteManager {
  constructor(
    protected readonly definitions: RouteDefinitionManager,
    protected readonly matchers: RouteMatcherManager,
    protected readonly componentsLoader: RouteComponentsLoader
  ) {
    super()
  }

  public loadComponents(
    definition: RouteDefinition<RouteKind>
  ): Promise<LoadComponentsReturnType | null> {
    return this.componentsLoader.load(definition)
  }

  /**
   * Loads the definitions and matchers in order.
   */
  protected async loader(): Promise<void> {
    await this.definitions.forceReload()
    await this.matchers.forceReload()
  }

  /**
   * Finds the definition for the given page. This will load the definitions if
   * they have not been loaded yet, but will not reload them if they have been
   * loaded.
   *
   * @param spec the specification of the definition to find.
   * @returns The definition for the page, or null if no definition was found.
   */
  public findDefinition<D extends RouteDefinition<RouteKind>>(
    ...specs: RouteDefinitionFilterSpec<D>[]
  ): Promise<D | null> {
    return this.definitions.find(...specs)
  }

  /**
   * Returns true if a route definition exists that matches one of the given
   * specifications.
   *
   * @param specs The specification to match.
   */
  public hasDefinition<D extends RouteDefinition<RouteKind>>(
    ...specs: Partial<D>[]
  ): Promise<boolean> {
    return this.definitions.has(...specs)
  }

  /**
   * Matches the given pathname and options against the matchers and returns the
   * first match.
   *
   * @param pathname The pathname to match.
   * @param options The options to match with.
   * @returns
   */
  public async match(
    pathname: string,
    options: MatchOptions
  ): Promise<RouteMatch | null> {
    for await (const match of this.matchAll(pathname, options)) {
      return match
    }

    return null
  }

  /**
   * Matches the given pathname and options against the matchers and returns all
   * matches as an async generator.
   *
   * @param pathname The pathname to match.
   * @param options The options to match with.
   * @returns
   */
  public matchAll(
    pathname: string,
    options: MatchOptions
  ): AsyncGenerator<RouteMatch, void, void> {
    return this.matchers.matchAll(pathname, options)
  }
}
