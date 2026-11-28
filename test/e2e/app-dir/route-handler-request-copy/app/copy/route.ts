import { types } from 'node:util'
import { NextRequest } from 'next/server'

async function respond(request: NextRequest, copy: Request) {
  return Response.json({
    // Node.js 24 does not copy a Proxy of a request, Node.js 20 does.
    isProxy: types.isProxy(request),
    request: {
      header: request.headers.get('x-test'),
      search: request.nextUrl.search,
    },
    copy: {
      header: copy.headers.get('x-test'),
      body: await copy.text(),
    },
  })
}

export function POST(request: NextRequest) {
  return respond(request, new Request(request))
}

export function PUT(request: NextRequest) {
  return respond(request, new NextRequest(request))
}
