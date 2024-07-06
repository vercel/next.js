export function middleware(req) {
  if (req.nextUrl.pathname === '/middleware-error') {
    throw new Error('Error from middleware')
  }
}
