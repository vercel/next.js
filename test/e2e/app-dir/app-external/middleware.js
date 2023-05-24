import { createResponse } from 'cjs-lib'

export function middleware(request) {
  if (request.nextUrl.pathname === '/test-middleware') {
    return createResponse('it works')
  }
}
