import { cookies } from 'next/headers'
import { after, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const url = new URL(request.url)

  const cookieStore = await cookies()
  if (url.pathname === '/cookies/middleware-to-after/via-closure') {
    after(async () => {
      cookieStore.set('illegalCookie', 'too-late-for-that')
    })
  }
}

export const config = {
  matcher: ['/cookies/middleware-to-after/:path*'],
}
