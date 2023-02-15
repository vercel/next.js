import { AppPageRouteMatch } from '../route-matches/app-page-route-match'
import { RouteHandler } from './route-handler'

export class AppPageRouteHandler implements RouteHandler<AppPageRouteMatch> {
  public async handle(): Promise<void> {
    throw new Error('Method not implemented.')
  }
}
