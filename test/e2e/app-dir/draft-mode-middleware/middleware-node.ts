export { middleware } from './middleware-edge'

// Cannot re-export configs.
export const config = {
  matcher: ['/((?!_next/static|_next/image|img|assets|ui|favicon.ico).*)'],
}

export const runtime = 'nodejs'
