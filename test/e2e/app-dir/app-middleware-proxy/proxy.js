import { NextResponse } from 'next/server'

export async function proxy(request) {
  return new NextResponse('redirected')
}

export const config = {
  matcher: '/headers',
}
