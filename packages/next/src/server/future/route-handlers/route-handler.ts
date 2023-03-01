import { BaseNextRequest, BaseNextResponse } from '../../base-http'
import { RouteMatch } from '../route-matches/route-match'

export interface RouteHandler<M extends RouteMatch = RouteMatch> {
  handle(
    match: M,
    req: BaseNextRequest,
    res: BaseNextResponse,
    context?: any,
    bubbleResult?: boolean
  ): Promise<any>
}
