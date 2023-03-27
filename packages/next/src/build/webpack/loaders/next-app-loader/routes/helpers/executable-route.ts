import { RouteHandler } from '../../../../../../server/future/route-handlers/route-handler'

export interface ExecutableRoute<H extends RouteHandler> {
  readonly handler: H
}
