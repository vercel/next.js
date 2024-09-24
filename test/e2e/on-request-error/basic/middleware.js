export function middleware(req) {
  if (req.nextUrl.pathname === '/middleware-error') {
    throw new Error('middleware-error')
  }
}
