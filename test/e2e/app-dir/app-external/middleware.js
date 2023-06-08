import { createResponse } from 'next-server-cjs-lib'
import { respond } from 'compat-next-server-module'

export async function middleware(request) {
  if (request.nextUrl.pathname === '/test-middleware') {
    return createResponse('it works')
  }

  return await respond()
}
