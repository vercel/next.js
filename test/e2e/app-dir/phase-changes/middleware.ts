import { cookies } from 'next/headers'
import { unstable_after as after, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const url = new URL(request.url)

  if (url.pathname === '/cookies/middleware-to-after') {
    after(async () => {
      const cookieStore = await cookies()
      cookieStore.set('illegalCookie', 'too-late-for-that')
    })
  } else if (url.pathname === '/cookies/middleware-to-after/via-closure') {
    const cookieStore = await cookies()
    after(async () => {
      cookieStore.set('illegalCookie', 'too-late-for-that')
    })
  }
}

export const config = {
  matcher: ['/cookies/middleware-to-after/:path*'],
}
