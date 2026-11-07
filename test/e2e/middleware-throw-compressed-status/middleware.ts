export default function middleware() {
  throw new Error('boom from middleware')
}

export const config = {
  matcher: '/',
}
