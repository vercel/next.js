import { createResponse } from 'cjs-lib'
import wrap from 'compat-next-server-module'

export function middleware(request) {
  if (request.nextUrl.pathname === '/test-middleware') {
    return createResponse('it works')
  }

  return wrap(async (req, ev) => {
    console.log('middleware')
  })
}

