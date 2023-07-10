import type { IncomingMessage, ServerResponse } from 'http'

type RouteResult =
  | { type: 'none' }
  | { type: 'error' }
  | {
      type: 'rewrite'
      url: string
      statusCode: number
      headers: Record<string, undefined | number | string | string[]>
    }

export async function makeResolver(..._args: any[]) {
  return async function resolveRoute(
    _req: IncomingMessage,
    res: ServerResponse
  ): Promise<RouteResult | void> {
    res.setHeader('x-nextjs-route-result', '1')
    res.end()

    return {
      type: 'rewrite',
      url: _req.url || '/',
      statusCode: 200,
      headers: res.getHeaders(),
    }
  }
}
