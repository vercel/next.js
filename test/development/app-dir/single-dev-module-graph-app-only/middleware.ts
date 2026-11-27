export function middleware() {
  throw new Error('middleware error')
}

export const config = {
  matcher: '/middleware-error',
}
