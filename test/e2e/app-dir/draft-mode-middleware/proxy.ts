export { middleware as proxy } from './middleware-edge'

export const config = {
  matcher: ['/((?!_next/static|_next/image|img|assets|ui|favicon.ico).*)'],
}
