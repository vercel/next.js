import type { RouteDefinition } from '../route-definitions/route-definition'

/**
 * RouteModuleOptions is the options that are passed to the route module, other
 * route modules should extend this class to add specific options for their
 * route.
 */
export interface RouteModuleOptions<
  D extends RouteDefinition = RouteDefinition,
  U = unknown
> {
  readonly definition: Readonly<D>
  readonly userland: Readonly<U>
}

/**
 * RouteHandlerContext is the base context for a route handler.
 */
export interface RouteModuleHandleContext {
  /**
   * Any matched parameters for the request. This is only defined for dynamic
   * routes.
   */
  params: Record<string, string | string[] | undefined> | undefined
}

/**
 * RouteModule is the base class for all route modules. This class should be
 * extended by all route modules.
 */
export abstract class RouteModule<
  D extends RouteDefinition = RouteDefinition,
  U = unknown
> {
  /**
   * The userland module. This is the module that is exported from the user's
   * code. This is marked as readonly to ensure that the module is not mutated
   * because the module (when compiled) only provides getters.
   */
  public readonly userland: Readonly<U>

  /**
   * The definition of the route.
   */
  public readonly definition: Readonly<D>

  /**
   * The shared modules that are exposed and required for the route module.
   */
  public static readonly sharedModules: any

  constructor({ userland, definition }: RouteModuleOptions<D, U>) {
    this.userland = userland
    this.definition = definition
  }
}
