import { NextResponse } from 'next/server'

export function POST() {
  const response = new NextResponse('offline navigation mutation response')
  response.cookies.set('offline-navigation-route-mutation', 'online', {
    path: '/',
    sameSite: 'lax',
  })
  return response
}
