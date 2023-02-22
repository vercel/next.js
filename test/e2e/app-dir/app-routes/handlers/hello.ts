import { type NextRequest } from 'next/server'
import { withRequestMeta } from '../helpers'

export const helloHandler = async (
  request: NextRequest,
  { params }: { params?: Record<string, string | string[]> }
): Promise<Response> => {
  const { pathname } = request.nextUrl

  return new Response('hello, world', {
    headers: withRequestMeta({
      method: request.method,
      params: params ?? null,
      pathname,
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
