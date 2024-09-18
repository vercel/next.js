import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  console.log('GET', request.url)

  return Response.json({ hello: 'world' })
}
