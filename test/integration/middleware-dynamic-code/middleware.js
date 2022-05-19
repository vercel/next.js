import { notUsingEval, usingEval } from './lib/utils'

export async function middleware(request) {
  if (request.nextUrl.pathname === '/using-eval') {
    return new Response(null, {
      headers: { data: JSON.stringify(await usingEval()) },
    })
  }

  if (request.nextUrl.pathname === '/not-using-eval') {
    return new Response(null, {
      headers: { data: JSON.stringify(await notUsingEval()) },
    })
  }
}
