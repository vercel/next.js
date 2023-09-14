import type {
  RouteComponentsLoader,
  RouteComponents,
} from './route-components-loader'
import type { RouteDefinition } from '../route-definitions/route-definition'

import { loadComponents } from '../../load-components'
import { isAppRouteRouteDefinition } from '../route-definitions/app-route-route-definition'
import { isAppPageRouteDefinition } from '../route-definitions/app-page-route-definition'
import { isInternalAppRouteDefinition } from '../route-definitions/internal-route-definition'

/**
 * A route components loader that loads components from the file system.
 */
export class BaseRouteComponentsLoader implements RouteComponentsLoader {
  constructor(private readonly distDir: string) {}

  /**
   * Loads the components for the given route definition.
   *
   * @param definition the route definition to load components for
   * @returns the loaded components or null if the components could not be loaded
   */
  public async load(
    definition: RouteDefinition
  ): Promise<RouteComponents | null> {
    try {
      return await loadComponents({
        distDir: this.distDir,
        page: definition.page,
        isAppPath:
          isAppPageRouteDefinition(definition) ||
          isAppRouteRouteDefinition(definition) ||
          isInternalAppRouteDefinition(definition),
      })
    } catch {
      return null
    }
  }
}
