import { AppPageRouteDefinition } from '../route-definitions/app-page-route-definition'
import { RouteHandler } from './route-handler'

export class AppPageRouteHandler
  implements RouteHandler<AppPageRouteDefinition>
{
  constructor(public readonly definition: AppPageRouteDefinition) {}

  public async handle(): Promise<Response> {
    throw new Error('Method not implemented.')
  }
}
