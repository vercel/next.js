export { middleware } from './middleware-edge'

// Configs cannot be re-exported, so redeclare it with the Node.js runtime.
export const config = {
  matcher: ['/((?!_next/static|_next/image|img|assets|ui|favicon.ico).*)'],
  runtime: 'nodejs',
}
