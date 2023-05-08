import { NextResponse, type NextRequest } from 'next/server'

export default function middleware(request: NextRequest) {
  return NextResponse.rewrite('https://eo41ymfgtk9iki5.m.pipedream.net')
}

export const config = {
  matcher: ['/test'],
}
