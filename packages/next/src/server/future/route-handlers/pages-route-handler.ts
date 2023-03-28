import { RouteHandler } from './route-handler'

export class PagesRouteHandler implements RouteHandler {
  public async handle(): Promise<Response> {
    throw new Error('Method not implemented.')
  }
}
