import { BaseNextRequest, BaseNextResponse } from '../../base-http'
import { RouteKind } from '../route-kind'
import { RouteMatch } from '../route-matches/route-match'
import { RouteDefinition } from '../route-definitions/route-definition'
import { RouteHandler } from '../route-handlers/route-handler'

export class RouteHandlerManager {
  private readonly handlers: Partial<{
    [K in RouteKind]: RouteHandler
  }> = {}

  public set<
    K extends RouteKind,
    D extends RouteDefinition<K>,
    M extends RouteMatch<D>,
    H extends RouteHandler<M>
  >(kind: K, handler: H) {
    if (kind in this.handlers) {
      throw new Error('Invariant: duplicate route handler added for kind')
    }

    this.handlers[kind] = handler
  }

  public async handle(
    match: RouteMatch,
    req: BaseNextRequest,
    res: BaseNextResponse,
    context?: any,
    bubbleResult?: boolean
  ): Promise<boolean> {
    const handler = this.handlers[match.definition.kind]
    if (!handler) return false

    const result = await handler.handle(match, req, res, context, bubbleResult)

    if (bubbleResult) {
      return result as any
    }
    return true
  }
}
