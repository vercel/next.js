import { PagesAPIRouteDefinition } from '../route-definitions/pages-api-route-definition'
import { RouteHandler } from './route-handler'

export class PagesAPIRouteHandler
  implements RouteHandler<PagesAPIRouteDefinition>
{
  constructor(public readonly definition: PagesAPIRouteDefinition) {}

  public async handle(): Promise<Response> {
    throw new Error('Method not implemented.')
  }
}
