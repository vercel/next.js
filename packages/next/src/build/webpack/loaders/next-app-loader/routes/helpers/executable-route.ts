import type { RouteHandler } from '../../../../../../server/future/route-handlers/route-handler'
import type {
  HandlerModule,
  HandlerRoute,
} from '../../../../../../server/future/route-handler-managers/route-handler-manager'
import type { RouteDefinition } from '../../../../../../server/future/route-definitions/route-definition'

export interface ExecutableRouteOptions<
    D extends RouteDefinition,
    H extends RouteHandler,
    U = unknown
  >
  // We omit the `route` property because these options are used to create one!
  extends Omit<HandlerModule<D, H, U>, 'route'> {}

export type ExecutableRoute<
  D extends RouteDefinition,
  H extends RouteHandler
> = HandlerRoute<D, H>
