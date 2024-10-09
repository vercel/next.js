import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  console.log('GET', request.url)

  return Response.json({ hello: 'world' })
}

export async function POST(request: NextRequest) {
  console.log('POST', request.url, await request.json())

  return Response.json({ hello: 'world' })
}
