import { PagesAPIRouteMatch } from '../route-matches/pages-api-route-match'
import { RouteHandler } from './route-handler'

export class PagesAPIRouteHandler implements RouteHandler<PagesAPIRouteMatch> {
  public async handle(): Promise<Response> {
    throw new Error('Method not implemented.')
  }
}
