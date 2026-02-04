import { type NextRequest } from 'next/server'
import { withRequestMeta } from '../helpers'

const helloHandler = async (
  request: NextRequest,
  { params }: { params?: Promise<Record<string, string | string[]>> }
): Promise<Response> => {
  const { pathname } = request.nextUrl

  if (typeof WebSocket === 'undefined') {
    throw new Error('missing WebSocket constructor!!')
  }

  const resolvedParams = params ? await params : null

  return new Response('hello, world', {
    headers: withRequestMeta({
      method: request.method,
      params: resolvedParams,
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
