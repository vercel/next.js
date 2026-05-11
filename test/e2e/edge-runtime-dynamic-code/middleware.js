import { NextResponse } from 'next/server'
import { notUsingEval, usingEval } from './lib/utils'
import {
  usingWebAssemblyCompile,
  usingWebAssemblyInstantiate,
  usingWebAssemblyInstantiateWithBuffer,
} from './lib/wasm'

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

  if (request.nextUrl.pathname === '/using-webassembly-compile') {
    return new Response(null, {
      headers: { data: JSON.stringify(await usingWebAssemblyCompile(9)) },
    })
  }

  if (request.nextUrl.pathname === '/using-webassembly-instantiate') {
    return new Response(null, {
      headers: { data: JSON.stringify(await usingWebAssemblyInstantiate(9)) },
    })
  }

  if (
    request.nextUrl.pathname === '/using-webassembly-instantiate-with-buffer'
  ) {
    return new Response(null, {
      headers: {
        data: JSON.stringify(await usingWebAssemblyInstantiateWithBuffer(9)),
      },
    })
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    '/using-eval',
    '/not-using-eval',
    '/using-webassembly-compile',
    '/using-webassembly-instantiate',
    '/using-webassembly-instantiate-with-buffer',
  ],
}
