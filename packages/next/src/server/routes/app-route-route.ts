import type { RequestAsyncStorage } from '../../client/components/request-async-storage'
import type { Params } from '../../shared/lib/router/utils/route-matcher'
import type { HTTP_METHOD } from '../web/http'
import type { RouteType } from './route'

// TODO: document
export type AppRouteHandlerFn = (
  req: Request,
  ctx: { params?: Params }
) => Response

/**
 * AppRouteModule is the specific userland module that is exported. This will
 * contain the HTTP methods that this route can respond to.
 */
export type AppRouteModule = {
  /**
   * Contains all the exported userland code.
   */
  handlers: Record<HTTP_METHOD, AppRouteHandlerFn>

  /**
   * The exported async storage object for this worker/module.
   */
  requestAsyncStorage: RequestAsyncStorage
}

/**
 * Dependencies for a given route describing an App Route.
 */
export type AppRouteRoute = {
  type: RouteType.APP_ROUTE

  /**
   * module is the specific userland module that is exported. This will contain
   * the HTTP methods that this route can respond to.
   */
  module: AppRouteModule

  /**
   * params are the parsed path parameters on the request.
   */
  params?: Params
}
