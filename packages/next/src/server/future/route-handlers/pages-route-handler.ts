import { PagesRouteDefinition } from '../route-definitions/pages-route-definition'
import { RouteHandler } from './route-handler'

export class PagesRouteHandler implements RouteHandler<PagesRouteDefinition> {
  constructor(public readonly definition: PagesRouteDefinition) {}

  public async handle(): Promise<Response> {
    throw new Error('Method not implemented.')
  }
}
