import { withRequestMeta } from '../../../helpers'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest): Promise<Response> {
  const { searchParams } = request.nextUrl

  return new Response('hello, world', {
    headers: withRequestMeta({
      ping: searchParams.get('ping'),
    }),
  })
}
