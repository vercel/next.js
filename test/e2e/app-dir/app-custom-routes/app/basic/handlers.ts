import { type NextRequest } from 'next/server'

const handler = async (request: NextRequest): Promise<Response> => {
  return new Response('hello, world')
}

export const GET = handler
export const POST = handler
export const PUT = handler
export const DELETE = handler
export const PATCH = handler
