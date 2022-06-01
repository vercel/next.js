export function middleware(req) {
  if (
    req.nextUrl.pathname === '/error-throw' &&
    req.headers.has('x-middleware-preflight')
  ) {
    throw new Error('test error')
  }
}
