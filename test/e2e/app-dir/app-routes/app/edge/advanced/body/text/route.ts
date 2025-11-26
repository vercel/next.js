import type { NextRequest } from 'next/server'
import { withRequestMeta } from '../../../../../helpers'

export const runtime = 'edge'

export async function POST(request: NextRequest) {
  const body = await request.text()
  return new Response('hello, world', {
    status: 200,
    headers: withRequestMeta({ body }),
  })
}
