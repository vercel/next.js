import type { RouteDefinition } from '../route-definitions/route-definition'
import type { NextRequest } from '../../web/spec-extension/request'
import type { NextConfigComplete } from '../../config-shared'
import type { OutgoingHttpHeaders } from 'http'
import type { __ApiPreviewProps } from '../../api-utils'

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
const { actionAsyncStorage } =
  require('next/dist/client/components/action-async-storage') as typeof import('../../../client/components/action-async-storage')

/**
 * RouteModuleOptions is the options that are passed to the route module, other
 * route modules should extend this class to add specific options for their
 * route.
 */
export interface RouteModuleOptions<
  C extends Partial<NextConfigComplete>,
  D extends RouteDefinition = RouteDefinition,
  U = unknown
> {
  readonly config: C
  readonly definition: D
  readonly userland: Readonly<U>
}

/**
 * RouteHandlerContext is the base context for a route handler.
 */
export interface RouteModuleHandleContext {
  /**
   * If true, indicates that this request is during static generation.
   */
  export: boolean

  /**
   * Any matched parameters for the request. This is only defined for dynamic
   * routes.
   */
  params: Record<string, string | string[] | undefined> | undefined

  /**
   * The headers that should be set on the response. These may be overridden by
   * the route module to facilitate features like caching, redirects, and draft
   * mode.
   */
  headers: OutgoingHttpHeaders | undefined

  previewProps: __ApiPreviewProps | undefined
}

/**
 * RouteModule is the base class for all route modules. This class should be
 * extended by all route modules.
 */
export abstract class RouteModule<
  C extends Partial<NextConfigComplete> = Partial<NextConfigComplete>,
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
   * A reference to the mutation related async storage, such as mutations of
   * cookies.
   */
  public readonly actionAsyncStorage = actionAsyncStorage

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
   * The contents of next.config.js for the current project.
   */
  public readonly config: Readonly<C>

  /**
   * Handle will handle the request and return a response. This may also patch
   * globals or perform validation of the userland module.
   */
  public abstract handle(
    request: NextRequest,
    context: RouteModuleHandleContext
  ): Promise<Response>

  public constructor({
    config,
    definition,
    userland,
  }: RouteModuleOptions<C, D, U>) {
    this.config = config
    this.definition = definition
    this.userland = userland
  }
}
