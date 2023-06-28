import type { IncomingMessage, ServerResponse } from 'http'

type RouteResult = {
  type: 'rewrite'
  url: string
  statusCode: number
  headers: Record<string, undefined | number | string | string[]>
}

export async function makeResolver() {
  return async function resolveRoute(
    _req: IncomingMessage,
    _res: ServerResponse
  ): Promise<RouteResult | void> {
    return {
      type: 'rewrite',
      url: _req.url || '/',
      statusCode: 200,
      headers: _res.getHeaders(),
    }
  }
}
