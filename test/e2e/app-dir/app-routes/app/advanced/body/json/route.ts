import type { NextRequest } from 'next/server'
import { withRequestMeta } from '../../../../helpers'

export async function POST(request: NextRequest) {
  const body = await request.json()
  return new Response('hello, world', {
    status: 200,
    headers: withRequestMeta({ body }),
  })
}

export async function DELETE(request: NextRequest) {
  const body = await request.json()
  return new Response('delete ' + body.name, {
    status: 200,
  })
}

export async function OPTIONS(request: NextRequest) {
  const body = await request.json()
  return new Response('options ' + body.name, {
    status: 200,
  })
}
