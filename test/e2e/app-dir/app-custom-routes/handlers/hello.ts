import { type NextRequest } from 'next/server'
import { withRequestMeta } from '../helpers'

export const helloHandler = async (
  request: NextRequest,
  ctx: { params?: Record<string, string | string[]> }
): Promise<Response> => {
  return new Response('hello, world', {
    headers: withRequestMeta({
      method: request.method,
      params: ctx.params ?? null,
      // TODO: update when we wrap the request object
      pathname: request.url,
    }),
  })
}

export const GET = helloHandler
export const HEAD = helloHandler
export const OPTIONS = helloHandler
export const POST = helloHandler
export const PUT = helloHandler
export const DELETE = helloHandler
export const PATCH = helloHandler
