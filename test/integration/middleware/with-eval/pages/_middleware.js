import { notUsingEval, usingEval } from '../lib/utils'

export async function middleware(request) {
  if (request.nextUrl.pathname === '/using-eval') {
    return new Response(JSON.stringify(await usingEval()), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }

  if (request.nextUrl.pathname === '/not-using-eval') {
    return new Response(JSON.stringify(await notUsingEval()), {
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }
}
