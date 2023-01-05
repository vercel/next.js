import { type NextRequest } from 'next/server'
import { withRequestMeta } from '../helpers'

export const helloHandler = async (request: NextRequest): Promise<Response> => {
  return new Response('hello, world', {
    headers: withRequestMeta({
      method: request.method,
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
