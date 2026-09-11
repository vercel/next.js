import { NextResponse } from 'next/server'

export function proxy(request) {
  if (request.headers.get('upgrade') === 'websocket') {
    return new Response('Next.js raced the shared WebSocket listener.', {
      status: 418,
    })
  }
  return NextResponse.next()
}

export const config = {
  matcher: '/api/my_awesome_socket/:path*',
}
