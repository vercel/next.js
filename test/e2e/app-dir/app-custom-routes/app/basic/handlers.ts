import { type NextRequest } from 'next/server'
import { withRequestMeta } from '../helpers'

const handler = async (request: NextRequest): Promise<Response> => {
  return new Response('hello, world', {
    headers: withRequestMeta({
      method: request.method,
    }),
  })
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
