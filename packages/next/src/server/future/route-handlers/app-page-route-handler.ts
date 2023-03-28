import type { RouteHandler } from './route-handler'

export class AppPageRouteHandler implements RouteHandler {
  public async handle(): Promise<Response> {
    throw new Error('Method not implemented.')
  }
}
