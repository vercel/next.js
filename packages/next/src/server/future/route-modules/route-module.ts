import type { RouteDefinition } from '../route-definitions/route-definition'
import type { NextRequest } from '../../web/spec-extension/request'
import type { Params } from '../../../shared/lib/router/utils/route-matcher'

// These are imported weirdly like this because of the way that the bundling
// works. We need to import the built files from the dist directory, but we
// can't do that directly because we need types from the source files. So we
// import the types from the source files and then import the built files.
const { requestAsyncStorage } =
  require('next/dist/client/components/request-async-storage') as typeof import('../../../client/components/request-async-storage')
const { staticGenerationAsyncStorage } =
  require('next/dist/client/components/static-generation-async-storage') as typeof import('../../../client/components/static-generation-async-storage')
const serverHooks =
  require('next/dist/client/components/hooks-server-context') as typeof import('../../../client/components/hooks-server-context')
const headerHooks =
  require('next/dist/client/components/headers') as typeof import('../../../client/components/headers')
const { staticGenerationBailout } =
  require('next/dist/client/components/static-generation-bailout') as typeof import('../../../client/components/static-generation-bailout')

/**
 * RouteModuleOptions is the options that are passed to the route module, other
 * route modules should extend this class to add specific options for their
 * route.
 */
export interface RouteModuleOptions<U = unknown> {
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
  params: Params | undefined
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
   * A reference to the request async storage.
   */
  public readonly requestAsyncStorage = requestAsyncStorage

  /**
   * A reference to the static generation async storage.
   */
  public readonly staticGenerationAsyncStorage = staticGenerationAsyncStorage

  /**
   * An interface to call server hooks which interact with the underlying
   * storage.
   */
  public readonly serverHooks = serverHooks

  /**
   * An interface to call header hooks which interact with the underlying
   * request storage.
   */
  public readonly headerHooks = headerHooks

  /**
   * An interface to call static generation bailout hooks which interact with
   * the underlying static generation storage.
   */
  public readonly staticGenerationBailout = staticGenerationBailout

  /**
   * The userland module. This is the module that is exported from the user's
   * code. This is marked as readonly to ensure that the module is not mutated
   * because the module (when compiled) only provides getters.
   */
  public readonly userland: Readonly<U>

  /**
   * The definition of the route.
   */
  public abstract readonly definition: D

  /**
   * Setup will setup the route handler. This could patch any globals or perform
   * validation of the userland module. It is the responsibility of the module
   * to ensure that this is only called once.
   */
  public abstract setup(): Promise<void>

  /**
   * Handle will handle the request and return a response.
   */
  public abstract handle(
    req: NextRequest,
    context: RouteModuleHandleContext
  ): Promise<Response>

  constructor({ userland }: RouteModuleOptions<U>) {
    this.userland = userland
  }
}
